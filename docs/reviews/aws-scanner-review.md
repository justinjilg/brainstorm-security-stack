<!-- Review consensus: rejected (0/3 pass, 0 critical) -->

# Code Review: AWS Resource Scanner

## Casey (casey-apisec)
**Verdict: FAIL**

VERDICT: FAIL

## Findings

1. **Nil pointer dereferences** - `scanEC2()` line 91 and `scanS3()` line 117 dereference pointers without nil checks:
   ```go
   AssetID: *instance.InstanceId,  // line 91
   AssetID: *bucket.Name,          // line 117
   ```
   AWS SDK can return nil for these fields when instances are terminating or buckets are being deleted.

2. **Unbounded goroutines** - `Scan()` spawns goroutines equal to `len(scanner.Regions)` without respecting the `Workers` field. If someone passes 25 regions, you get 25 concurrent AWS API calls.

3. **Race condition on error handling** - `Scan()` lines 46-58 only returns the first error from `errChan`. If multiple regions fail, you lose error information and still return partial results without indicating which regions failed.

4. **No pagination handling** - `scanEC2()` and `scanS3()` don't handle pagination. AWS limits DescribeInstances to 1000 instances per response. Large accounts will silently miss resources.

5. **Duplicate code** - The entire file is duplicated between `aws.go` and `types.go`. This isn't just bad practice — it's a maintenance nightmare waiting to happen.

## Security Concerns

1. **No rate limiting** - This scanner can hammer AWS APIs and trigger throttling or abuse detection. In multi-tenant environments, this could impact other services using the same credentials.

2. **No permission validation** - The scanner doesn't check if it has the required IAM permissions before attempting operations. Failed permission checks will appear as generic errors.

3. **Metadata field accepts any type** - The `interface{}` type in `Asset.Metadata` means downstream consumers can't safely type-assert without risking panics.

4. **No timeout control** - Context is passed through but never augmented with timeouts. A slow region could hang the entire scan indefinitely.

## Suggestions

1. Add nil checks before dereferencing:
   ```go
   if instance.InstanceId != nil {
       asset.AssetID = *instance.InstanceId
   }
   ```

2. Implement worker pool pattern:
   ```go
   sem := make(chan struct{}, scanner.Workers)
   for _, region := range scanner.Regions {
       sem <- struct{}{}
       go func(region string) {
           defer func() { <-sem }()
           // scan logic
       }(region)
   }
   ```

3. Use paginator APIs:
   ```go
   paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})
   for paginator.HasMorePages() {
       output, err := paginator.NextPage(ctx)
       // process page
   }
   ```

4. Return structured errors with region context and aggregate all failures.

5. Delete the duplicate file and fix your build process.

---

## Taylor (taylor-qa)
**Verdict: FAIL**

VERDICT: FAIL

## Findings

1. **Nil pointer dereferences** - `scanEC2()` line 91 and `scanS3()` line 117 dereference pointers without nil checks:
   ```go
   AssetID: *instance.InstanceId,  // line 91
   AssetID: *bucket.Name,          // line 117
   ```
   AWS SDK can return nil for these fields when instances are terminating or buckets are being deleted.

2. **Unbounded goroutines** - `Scan()` spawns goroutines equal to `len(scanner.Regions)` without respecting the `Workers` field. If someone passes 25 regions, you get 25 concurrent AWS API calls.

3. **Race condition on error handling** - `Scan()` lines 46-58 only returns the first error from `errChan`. If multiple regions fail, you lose error information and still return partial results without indicating which regions failed.

4. **No pagination handling** - `scanEC2()` and `scanS3()` don't handle pagination. AWS limits DescribeInstances to 1000 instances per response. Large accounts will silently miss resources.

5. **Duplicate code** - The entire file is duplicated between `aws.go` and `types.go`. This isn't just bad practice — it's a maintenance nightmare waiting to happen.

## Security Concerns

1. **No rate limiting** - This scanner can hammer AWS APIs and trigger throttling or abuse detection. In multi-tenant environments, this could impact other services using the same credentials.

2. **No permission validation** - The scanner doesn't check if it has the required IAM permissions before attempting operations. Failed permission checks will appear as generic errors.

3. **Metadata field accepts any type** - The `interface{}` type in `Asset.Metadata` means downstream consumers can't safely type-assert without risking panics.

4. **No timeout control** - Context is passed through but never augmented with timeouts. A slow region could hang the entire scan indefinitely.

## Suggestions

1. Add nil checks before dereferencing:
   ```go
   if instance.InstanceId != nil {
       asset.AssetID = *instance.InstanceId
   }
   ```

2. Implement worker pool pattern:
   ```go
   sem := make(chan struct{}, scanner.Workers)
   for _, region := range scanner.Regions {
       sem <- struct{}{}
       go func(region string) {
           defer func() { <-sem }()
           // scan logic
       }(region)
   }
   ```

3. Use paginator APIs:
   ```go
   paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})
   for paginator.HasMorePages() {
       output, err := paginator.NextPage(ctx)
       // process page
   }
   ```

4. Return structured errors with region context and aggregate all failures.

5. Delete the duplicate file and fix your build process.

---

## Alex (alex-crypto)
**Verdict: FAIL**

VERDICT: FAIL

## Findings

1. **Nil pointer dereferences** - `scanEC2()` line 91 and `scanS3()` line 117 dereference pointers without nil checks:
   ```go
   AssetID: *instance.InstanceId,  // line 91
   AssetID: *bucket.Name,          // line 117
   ```
   AWS SDK can return nil for these fields when instances are terminating or buckets are being deleted.

2. **Unbounded goroutines** - `Scan()` spawns goroutines equal to `len(scanner.Regions)` without respecting the `Workers` field. If someone passes 25 regions, you get 25 concurrent AWS API calls.

3. **Race condition on error handling** - `Scan()` lines 46-58 only returns the first error from `errChan`. If multiple regions fail, you lose error information and still return partial results without indicating which regions failed.

4. **No pagination handling** - `scanEC2()` and `scanS3()` don't handle pagination. AWS limits DescribeInstances to 1000 instances per response. Large accounts will silently miss resources.

5. **Duplicate code** - The entire file is duplicated between `aws.go` and `types.go`. This isn't just bad practice — it's a maintenance nightmare waiting to happen.

## Security Concerns

1. **No rate limiting** - This scanner can hammer AWS APIs and trigger throttling or abuse detection. In multi-tenant environments, this could impact other services using the same credentials.

2. **No permission validation** - The scanner doesn't check if it has the required IAM permissions before attempting operations. Failed permission checks will appear as generic errors.

3. **Metadata field accepts any type** - The `interface{}` type in `Asset.Metadata` means downstream consumers can't safely type-assert without risking panics.

4. **No timeout control** - Context is passed through but never augmented with timeouts. A slow region could hang the entire scan indefinitely.

## Suggestions

1. Add nil checks before dereferencing:
   ```go
   if instance.InstanceId != nil {
       asset.AssetID = *instance.InstanceId
   }
   ```

2. Implement worker pool pattern:
   ```go
   sem := make(chan struct{}, scanner.Workers)
   for _, region := range scanner.Regions {
       sem <- struct{}{}
       go func(region string) {
           defer func() { <-sem }()
           // scan logic
       }(region)
   }
   ```

3. Use paginator APIs:
   ```go
   paginator := ec2.NewDescribeInstancesPaginator(client, &ec2.DescribeInstancesInput{})
   for paginator.HasMorePages() {
       output, err := paginator.NextPage(ctx)
       // process page
   }
   ```

4. Return structured errors with region context and aggregate all failures.

5. Delete the duplicate file and fix your build process.
