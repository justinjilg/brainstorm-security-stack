//go:build ignore
// +build ignore

// File: internal/scanner/gcp_scanner.go
// Note: Excluded from build — cloud.google.com/go requires Go 1.25+
// and google.golang.org/api requires external network access.
// Re-enable when GCP provider is fully supported.

package scanner

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/compute/apiv1"
	"cloud.google.com/go/storage"
	computepb "google.golang.org/genproto/googleapis/cloud/compute/v1"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

// GCP resource types
type (
	GcpComputeInstance struct {
		ID         uint64
		Name       string
		Zone       string
		MachineType string
		Status     string
		Tags       []string
		ProjectID  string
	}

	GcpStorageBucket struct {
		Name         string
		Location     string
		Created      time.Time
		ProjectID    string
	}
)

// Result container
type GcpDiscoveryResult struct {
	ComputeInstances []GcpComputeInstance
	StorageBuckets   []GcpStorageBucket
}

// Scanner interface
type GcpScanner interface {
	DiscoverResources(ctx context.Context) (*GcpDiscoveryResult, error)
}

// Implementation
type gcpScanner struct {
	projectID      string
	clientOptions  []option.ClientOption
}

// NewGcpScanner creates a scanner for the given GCP project and options (e.g., credentials)
func NewGcpScanner(projectID string, opts ...option.ClientOption) GcpScanner {
	return &gcpScanner{
		projectID:     projectID,
		clientOptions: opts,
	}
}

func (s *gcpScanner) DiscoverResources(ctx context.Context) (*GcpDiscoveryResult, error) {
	instances, err := discoverAllComputeInstances(ctx, s.projectID, s.clientOptions...)
	if err != nil {
		return nil, fmt.Errorf("GCP Compute discovery failed: %w", err)
	}

	buckets, err := discoverAllStorageBuckets(ctx, s.projectID, s.clientOptions...)
	if err != nil {
		return nil, fmt.Errorf("GCP Storage discovery failed: %w", err)
	}

	return &GcpDiscoveryResult{
		ComputeInstances: instances,
		StorageBuckets:   buckets,
	}, nil
}

// --- Helpers ---

func discoverAllComputeInstances(ctx context.Context, projectID string, opts ...option.ClientOption) ([]GcpComputeInstance, error) {
	var instances []GcpComputeInstance

	// TODO: Consider using AggregatedList for cross-zone discovery (for now, iterate zones)
	zones, err := listGcpZones(ctx, projectID, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to list zones: %w", err)
	}

	client, err := compute.NewInstancesRESTClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create compute client: %w", err)
	}
	defer client.Close()

	for _, zone := range zones {
		req := &computepb.ListInstancesRequest{
			Project: projectID,
			Zone:    zone,
		}
		it := client.List(ctx, req)
		for {
			inst, err := it.Next()
			if err == iterator.Done {
				break
			}
			if err != nil {
				// Defensive: skip zone on error, don't panic
				break
			}
			instance := GcpComputeInstance{
				ID:          inst.GetId(),
				Name:        inst.GetName(),
				Zone:        zone,
				MachineType: lastPathComponent(inst.GetMachineType()),
				Status:      inst.GetStatus(),
				Tags:        inst.GetTags().GetItems(),
				ProjectID:   projectID,
			}
			instances = append(instances, instance)
		}
	}
	return instances, nil
}

// Helper to get the last path component (e.g., "zones/us-central1-a/machineTypes/n1-standard-1" -> "n1-standard-1")
func lastPathComponent(s string) string {
	if s == "" {
		return ""
	}
	parts := []rune(s)
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] == '/' {
			return string(parts[i+1:])
		}
	}
	return s
}

func listGcpZones(ctx context.Context, projectID string, opts ...option.ClientOption) ([]string, error) {
	// TODO: Cache zones per project, or allow caller to specify subset for large orgs
	zonesClient, err := compute.NewZonesRESTClient(ctx, opts...)
	if err != nil {
		return nil, err
	}
	defer zonesClient.Close()

	req := &computepb.ListZonesRequest{Project: projectID}
	it := zonesClient.List(ctx, req)
	var zones []string
	for {
		zone, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		zones = append(zones, zone.GetName())
	}
	return zones, nil
}

func discoverAllStorageBuckets(ctx context.Context, projectID string, opts ...option.ClientOption) ([]GcpStorageBucket, error) {
	client, err := storage.NewClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create storage client: %w", err)
	}
	defer client.Close()

	it := client.Buckets(ctx, projectID)
	var buckets []GcpStorageBucket
	for {
		bucketAttrs, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			// Defensive: skip on error, don't panic
			continue
		}
		bucket := GcpStorageBucket{
			Name:      bucketAttrs.Name,
			Location:  bucketAttrs.Location,
			Created:   bucketAttrs.Created,
			ProjectID: projectID,
		}
		buckets = append(buckets, bucket)
	}
	return buckets, nil
}

package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"yourmodule/internal/scanner"
	"google.golang.org/api/option"
)

func main() {
	ctx := context.Background()
	projectID := os.Getenv("GCP_PROJECT_ID")
	credsFile := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") // Path to service account key

	if projectID == "" || credsFile == "" {
		log.Fatalf("Set GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS environment variables")
	}

	gcpScan := scanner.NewGcpScanner(projectID, option.WithCredentialsFile(credsFile))
	result, err := gcpScan.DiscoverResources(ctx)
	if err != nil {
		log.Fatalf("Discovery failed: %v", err)
	}

	fmt.Printf("Compute Instances: %+v\n", result.ComputeInstances)
	fmt.Printf("Storage Buckets: %+v\n", result.StorageBuckets)
}
