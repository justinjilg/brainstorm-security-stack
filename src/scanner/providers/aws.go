<!-- Agent: quinn-architect | Model: gpt-4.1-2025-04-14 | Cost: $0.0252 | Latency: 207822ms -->
<!-- Route: explicit | Quality: 0.88 | Reputation: gold -->
<!-- Budget remaining: $49.97 -->
Absolutely. Here’s how I’ll approach this:

- **Scope**: Implement the AWS resource discovery component (“Scanner Engine” in ADR-001) as a Go module/package, focusing on enumerating EC2 instances and S3 buckets.  
- **Boundaries**: This code is a module within the modular monolith, not a standalone service. It exposes a Go interface for use by the orchestrating service layer.  
- **Security**: All AWS API calls use provided credentials (ideally temporary/session tokens), and errors are handled defensively. No secrets are logged.  
- **Extensibility**: The scanner is structured so adding Azure/GCP or other AWS resources is straightforward.  
- **Multi-tenancy**: The scanner operates per-credential set (i.e., per tenant/account), but does not manage tenancy itself—that’s the responsibility of the orchestrator per ADR-001.  
- **No persistence**: This module returns discovered resources as Go structs; persistence is handled elsewhere.

---

# Go Implementation: AWS Resource Scanner MVP

```go
// File: internal/scanner/aws_scanner.go

package scanner

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Resource types
type (
	AwsEC2Instance struct {
		InstanceID   string
		InstanceType string
		State        string
		Region       string
		Tags         map[string]string
	}

	AwsS3Bucket struct {
		Name         string
		CreationDate time.Time
		Region       string
	}
)

// Result container
type AwsDiscoveryResult struct {
	EC2Instances []AwsEC2Instance
	S3Buckets    []AwsS3Bucket
}

// Scanner interface
type AwsScanner interface {
	DiscoverResources(ctx context.Context) (*AwsDiscoveryResult, error)
}

// Implementation
type awsScanner struct {
	awsCfg aws.Config
}

// NewAwsScanner creates a scanner with the given AWS config (credentials, region, etc.)
func NewAwsScanner(ctx context.Context, cfg aws.Config) AwsScanner {
	return &awsScanner{awsCfg: cfg}
}

func (s *awsScanner) DiscoverResources(ctx context.Context) (*AwsDiscoveryResult, error) {
	// Discover EC2 instances in all regions
	ec2Instances, err := discoverAllEC2Instances(ctx, s.awsCfg)
	if err != nil {
		return nil, fmt.Errorf("EC2 discovery failed: %w", err)
	}

	// Discover S3 buckets (S3 is global, but bucket region must be looked up)
	s3Buckets, err := discoverAllS3Buckets(ctx, s.awsCfg)
	if err != nil {
		return nil, fmt.Errorf("S3 discovery failed: %w", err)
	}

	return &AwsDiscoveryResult{
		EC2Instances: ec2Instances,
		S3Buckets:    s3Buckets,
	}, nil
}

// --- Helpers ---

func discoverAllEC2Instances(ctx context.Context, cfg aws.Config) ([]AwsEC2Instance, error) {
	ec2Regions, err := listAwsRegions(ctx, cfg)
	if err != nil {
		return nil, err
	}

	var instances []AwsEC2Instance
	for _, region := range ec2Regions {
		regionCfg := cfg.Copy()
		regionCfg.Region = region
		client := ec2.NewFromConfig(regionCfg)
		paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})

		for paginator.HasMorePages() {
			page, err := paginator.NextPage(ctx)
			if err != nil {
				return nil, fmt.Errorf("EC2 describe error in region %s: %w", region, err)
			}
			for _, reservation := range page.Reservations {
				for _, inst := range reservation.Instances {
					tags := make(map[string]string)
					for _, t := range inst.Tags {
						if t.Key != nil && t.Value != nil {
							tags[*t.Key] = *t.Value
						}
					}
					instance := AwsEC2Instance{
						InstanceID:   aws.ToString(inst.InstanceId),
						InstanceType: string(inst.InstanceType),
						State:        string(inst.State.Name),
						Region:       region,
						Tags:         tags,
					}
					instances = append(instances, instance)
				}
			}
		}
	}
	return instances, nil
}

func listAwsRegions(ctx context.Context, cfg aws.Config) ([]string, error) {
	client := ec2.NewFromConfig(cfg)
	output, err := client.DescribeRegions(ctx, &ec2.DescribeRegionsInput{
		AllRegions: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	var regions []string
	for _, r := range output.Regions {
		if r.RegionName != nil {
			regions = append(regions, *r.RegionName)
		}
	}
	return regions, nil
}

func discoverAllS3Buckets(ctx context.Context, cfg aws.Config) ([]AwsS3Bucket, error) {
	client := s3.NewFromConfig(cfg)
	output, err := client.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}
	var buckets []AwsS3Bucket
	for _, b := range output.Buckets {
		region, err := getS3BucketRegion(ctx, cfg, aws.ToString(b.Name))
		if err != nil {
			// Defensive: if region lookup fails, skip bucket (don't panic)
			continue
		}
		buckets = append(buckets, AwsS3Bucket{
			Name:         aws.ToString(b.Name),
			CreationDate: aws.ToTime(b.CreationDate),
			Region:       region,
		})
	}
	return buckets, nil
}

func getS3BucketRegion(ctx context.Context, cfg aws.Config, bucket string) (string, error) {
	client := s3.NewFromConfig(cfg)
	// Use GetBucketLocation API
	out, err := client.GetBucketLocation(ctx, &s3.GetBucketLocationInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		return "", err
	}
	// Per AWS docs, "" or "us-east-1" both mean us-east-1
	region := string(out.LocationConstraint)
	if region == "" {
		region = "us-east-1"
	}
	return region, nil
}
```

---

# Usage Example (Orchestration Layer)

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"yourmodule/internal/scanner"

	"github.com/aws/aws-sdk-go-v2/config"
)

func main() {
	ctx := context.Background()
	awsCfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	scan := scanner.NewAwsScanner(ctx, awsCfg)
	result, err := scan.DiscoverResources(ctx)
	if err != nil {
		log.Fatalf("Discovery failed: %v", err)
	}

	fmt.Printf("EC2 Instances: %+v\n", result.EC2Instances)
	fmt.Printf("S3 Buckets: %+v\n", result.S3Buckets)
}
```

---

# Notes & Alignment

- **Threat Model**: No secrets are logged, all errors are handled defensively, and the scanner only uses provided credentials (no privilege escalation).
- **Architecture**: This is a module, not a service. It’s stateless and returns results to the orchestrator for storage, mapping, etc.
- **Extensible**: Adding more resource types (RDS, Lambda, etc.) is a matter of adding methods, not refactoring the core.
- **Multi-cloud**: The interface can be mirrored for Azure/GCP scanners.
- **Testing**: For unit tests, use AWS SDK’s stubber/mocks (not shown here).

If you want a test harness, error handling tweaks, or the start of a compliance mapping layer, let me know.
