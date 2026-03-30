package providers

import (
	"context"
	"fmt"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type AWSResourceScanner struct {
	Workers int
	Regions []string
	Logger  Logger
}

type Logger interface {
	Info(msg string, args ...interface{})
	Error(msg string, args ...interface{})
}

type Asset struct {
	AssetID  string
	Type     string
	Region   string
	Tags     map[string]string
	Owner    string
	Metadata map[string]interface{}
}

func (scanner *AWSResourceScanner) Scan(ctx context.Context, cfg aws.Config) ([]Asset, error) {
	var wg sync.WaitGroup
	assetsChan := make(chan []Asset, len(scanner.Regions))
	errChan := make(chan error, len(scanner.Regions))

	for _, region := range scanner.Regions {
		wg.Add(1)
		go func(region string) {
			defer wg.Done()
			regionAssets, err := scanner.scanRegion(ctx, cfg, region)
			if err != nil {
				errChan <- fmt.Errorf("region %s: %w", region, err)
				return
			}
			assetsChan <- regionAssets
		}(region)
	}

	wg.Wait()
	close(assetsChan)
	close(errChan)

	var allAssets []Asset
	for assets := range assetsChan {
		allAssets = append(allAssets, assets...)
	}

	select {
	case err := <-errChan:
		return allAssets, err
	default:
		return allAssets, nil
	}
}

func (scanner *AWSResourceScanner) scanRegion(ctx context.Context, cfg aws.Config, region string) ([]Asset, error) {
	cfg.Region = region
	var regionAssets []Asset

	ec2Client := ec2.NewFromConfig(cfg)
	ec2Assets, err := scanner.scanEC2(ctx, ec2Client, region)
	if err != nil {
		return nil, fmt.Errorf("EC2 scan failed: %w", err)
	}
	regionAssets = append(regionAssets, ec2Assets...)

	s3Client := s3.NewFromConfig(cfg)
	s3Assets, err := scanner.scanS3(ctx, s3Client, region)
	if err != nil {
		return nil, fmt.Errorf("S3 scan failed: %w", err)
	}
	regionAssets = append(regionAssets, s3Assets...)

	return regionAssets, nil
}

func (scanner *AWSResourceScanner) scanEC2(ctx context.Context, client *ec2.Client, region string) ([]Asset, error) {
	output, err := client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{})
	if err != nil {
		return nil, err
	}

	var assets []Asset
	for _, reservation := range output.Reservations {
		for _, instance := range reservation.Instances {
			asset := Asset{
				AssetID: *instance.InstanceId,
				Type:    "EC2 Instance",
				Region:  region,
				Tags:    convertTags(instance.Tags),
			}
			if instance.State != nil && instance.State.Name != "" {
				asset.Metadata = map[string]interface{}{
					"State": string(instance.State.Name),
				}
			}
			assets = append(assets, asset)
		}
	}
	return assets, nil
}

func (scanner *AWSResourceScanner) scanS3(ctx context.Context, client *s3.Client, region string) ([]Asset, error) {
	output, err := client.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}

	var assets []Asset
	for _, bucket := range output.Buckets {
		asset := Asset{
			AssetID: *bucket.Name,
			Type:    "S3 Bucket",
			Region:  region,
		}
		if bucket.CreationDate != nil {
			asset.Metadata = map[string]interface{}{
				"CreationDate": bucket.CreationDate,
			}
		}
		assets = append(assets, asset)
	}
	return assets, nil
}

func convertTags(tags []types.Tag) map[string]string {
	result := make(map[string]string)
	for _, tag := range tags {
		if tag.Key != nil && tag.Value != nil {
			result[*tag.Key] = *tag.Value
		}
	}
	return result
}
