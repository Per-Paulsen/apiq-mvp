/**
 * 404 surface for `/specs/*`. Triggered by the placeholder Spec Detail page
 * when the id is unknown or belongs to another workspace.
 */
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SpecsNotFound() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Spec not found</CardTitle>
          <CardDescription>
            That spec doesn&apos;t exist or isn&apos;t in your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/specs">Back to Specs</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
