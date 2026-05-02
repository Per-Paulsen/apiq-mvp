/**
 * Add Spec page (server component). Renders the Card shell + the client-side
 * `<AddSpecForm>` which owns `useActionState` for the URL-pull flow.
 *
 * No session check is needed here — the (app) route segment is gated by
 * Epic 02's middleware, and the form's server action calls
 * `getRequiredSession()` itself.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { AddSpecForm } from './add-spec-form';

export default function NewSpecPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a spec</CardTitle>
          <CardDescription>
            Pull an OpenAPI 3.x spec from a public or header-authed URL. apiq
            dereferences <code className="font-mono text-xs">$ref</code>s and
            triggers analysis automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddSpecForm />
        </CardContent>
      </Card>
    </main>
  );
}
