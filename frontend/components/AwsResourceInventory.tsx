// components/AwsInventoryWidget.tsx

'use client';

import React, { useEffect, useState } from 'react';

// Mocked API response shape (matches scanner output)
type AwsInventory = {
  ec2Count: number;
  s3Count: number;
  ec2Instances: { id: string; name: string; state: string; region: string }[];
  s3Buckets: { name: string; region: string; creationDate: string }[];
};

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: AwsInventory };

export default function AwsInventoryWidget() {
  const [state, setState] = useState<State>({ status: 'loading' });

  // Simulate API call with mock data
  useEffect(() => {
    const timer = setTimeout(() => {
      // Toggle this to 'true' to simulate error state
      const simulateError = false;
      if (simulateError) {
        setState({ status: 'error', error: 'Failed to load AWS inventory.' });
      } else {
        setState({
          status: 'success',
          data: {
            ec2Count: 3,
            s3Count: 2,
            ec2Instances: [
              { id: 'i-123', name: 'web-01', state: 'running', region: 'us-east-1' },
              { id: 'i-456', name: 'db-01', state: 'stopped', region: 'us-west-2' },
              { id: 'i-789', name: 'batch-01', state: 'running', region: 'eu-central-1' },
            ],
            s3Buckets: [
              { name: 'prod-data', region: 'us-east-1', creationDate: '2023-01-15' },
              { name: 'logs-archive', region: 'us-west-2', creationDate: '2022-11-03' },
            ],
          },
        });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      aria-labelledby="aws-inventory-title"
      className="rounded-lg border shadow-sm bg-white p-4 max-w-md"
      tabIndex={0}
    >
      <h2 id="aws-inventory-title" className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span role="img" aria-label="AWS">🟧</span> AWS Asset Inventory
      </h2>

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 text-gray-600">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full" />
          Loading AWS resources…
        </div>
      )}

      {state.status === 'error' && (
        <div className="text-red-600 flex items-center gap-2" role="alert">
          <span role="img" aria-label="Error">❌</span>
          {state.error}
        </div>
      )}

      {state.status === 'success' && (
        <>
          <div className="flex gap-6 mb-2">
            <div className="flex flex-col items-center">
              <span className="text-2xl" role="img" aria-label="EC2">🖥️</span>
              <span className="font-bold text-xl">{state.data.ec2Count}</span>
              <span className="text-xs text-gray-500">EC2 Instances</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl" role="img" aria-label="S3">🗄️</span>
              <span className="font-bold text-xl">{state.data.s3Count}</span>
              <span className="text-xs text-gray-500">S3 Buckets</span>
            </div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-blue-600 hover:underline">
              View Details
            </summary>
            <div className="mt-2">
              <div>
                <span className="font-semibold">EC2 Instances:</span>
                <ul className="ml-4 list-disc">
                  {state.data.ec2Instances.map((inst) => (
                    <li key={inst.id}>
                      <span className="font-mono">{inst.name}</span> ({inst.id}) — {inst.state}, {inst.region}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-2">
                <span className="font-semibold">S3 Buckets:</span>
                <ul className="ml-4 list-disc">
                  {state.data.s3Buckets.map((b) => (
                    <li key={b.name}>
                      <span className="font-mono">{b.name}</span> — {b.region}, created {b.creationDate}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <div className="mt-3">
            <a
              href="/findings?cloud=aws"
              className="inline-block text-sm text-blue-700 hover:underline font-medium"
            >
              View All AWS Findings →
            </a>
          </div>
        </>
      )}
    </section>
  );
}

import AwsInventoryWidget from '@/components/AwsInventoryWidget';

export default function DashboardOverview() {
  return (
    <main className="p-6">
      {/* ...other dashboard widgets... */}
      <AwsInventoryWidget />
    </main>
  );
}
