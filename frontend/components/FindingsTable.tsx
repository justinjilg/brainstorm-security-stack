import React, { useState, useEffect, useCallback } from 'react';

interface Finding {
  id: string;
  policyName: string;
  resourceId: string;
  resourceType: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  timestamp: string;
}

const getSeverityColor = (severity: Finding['severity']): string => {
  switch (severity) {
    case 'CRITICAL':
      return 'border-l-red-600 dark:border-l-red-500';
    case 'HIGH':
      return 'border-l-orange-500 dark:border-l-orange-400';
    case 'MEDIUM':
      return 'border-l-yellow-500 dark:border-l-yellow-400';
    case 'LOW':
      return 'border-l-blue-500 dark:border-l-blue-400';
    default:
      return 'border-l-gray-400 dark:border-l-gray-600';
  }
};

const getStatusColor = (status: Finding['status']): string => {
  switch (status) {
    case 'PASS':
      return 'text-green-600 dark:text-green-400';
    case 'FAIL':
      return 'text-red-600 dark:text-red-400';
    case 'WARN':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'INFO':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};

const FindingsTable: React.FC = () => {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In a real application, this would fetch from a backend API.
      // For demonstration, we'll use mock data.
      // Example API endpoint: /api/policy/findings
      const response = await fetch('/api/policy/findings'); // Placeholder API call
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: Finding[] = await response.json();
      setFindings(data);
    } catch (err) {
      console.error("Failed to fetch policy findings:", err);
      setError("Failed to load policy findings. Please try again.");
      // Fallback to mock data if API call fails during development/testing
      setFindings([
        {
          id: 'f1',
          policyName: 'S3-Bucket-Public-Access',
          resourceId: 'arn:aws:s3:::my-public-bucket-123',
          resourceType: 'AWS::S3::Bucket',
          status: 'FAIL',
          severity: 'CRITICAL',
          message: 'S3 bucket allows public read access.',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'f2',
          policyName: 'EC2-Instance-No-Public-IP',
          resourceId: 'i-0abcdef1234567890',
          resourceType: 'AWS::EC2::Instance',
          status: 'PASS',
          severity: 'LOW',
          message: 'EC2 instance does not have a public IP address.',
          timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
        },
        {
          id: 'f3',
          policyName: 'IAM-User-MFA-Enabled',
          resourceId: 'arn:aws:iam::123456789012:user/admin-user',
          resourceType: 'AWS::IAM::User',
          status: 'WARN',
          severity: 'HIGH',
          message: 'IAM user "admin-user" does not have MFA enabled.',
          timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
        {
          id: 'f4',
          policyName: 'RDS-Instance-Encrypted',
          resourceId: 'arn:aws:rds:us-east-1:123456789012:db:mydbinstance',
          resourceType: 'AWS::RDS::DBInstance',
          status: 'FAIL',
          severity: 'MEDIUM',
          message: 'RDS instance is not encrypted at rest.',
          timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-gray-600 dark:text-gray-300">
        <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading policy findings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
        <p className="font-semibold">Error:</p>
        <p>{error}</p>
        <button
          onClick={fetchFindings}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="p-6 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 rounded-md">
        No policy findings to display.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto shadow-md rounded-lg bg-white dark:bg-gray-800">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <caption className="sr-only">Table of Policy Evaluation Findings</caption>
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
            >
              Severity
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300"
            >
              Policy Name
            </th>
            <th
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray
