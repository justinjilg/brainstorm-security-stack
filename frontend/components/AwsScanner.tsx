import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardBody } from "@chakra-ui/react";
import { Table, Thead, Tbody, Tr, Th, Td } from "@chakra-ui/react";
import { Spinner, Alert, AlertIcon, Box } from "@chakra-ui/react";

interface AwsResource {
  id: string;
  type: string;
  region: string;
  status: string;
}

const AwsScanner: React.FC = () => {
  const [resources, setResources] = useState<AwsResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const response = await fetch("/api/aws-resources");
        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }
        const data = await response.json();
        setResources(data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch AWS resources.");
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100%">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert status="error" variant="subtle">
        <AlertIcon />
        {error}
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader fontSize="lg" fontWeight="bold">
        AWS Resource Scanner
      </CardHeader>
      <CardBody>
        {resources.length === 0 ? (
          <Alert status="info" variant="subtle">
            <AlertIcon />
            No AWS resources found.
          </Alert>
        ) : (
          <Table variant="striped" colorScheme="gray">
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>Type</Th>
                <Th>Region</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {resources.map((resource) => (
                <Tr key={resource.id}>
                  <Td>{resource.id}</Td>
                  <Td>{resource.type}</Td>
                  <Td>{resource.region}</Td>
                  <Td>{resource.status}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

export default AwsScanner;
