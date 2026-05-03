'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { Spec } from '@/generated/prisma/client';
import { Button } from '@/components/ui/button';
import { TOASTS, showToast } from '@/lib/toasts';

import { exportSpecAction } from '../actions';

export function ExportButtons({ spec }: { spec: Spec }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onExport(format: 'json' | 'yaml') {
    startTransition(async () => {
      const result = await exportSpecAction({ specId: spec.id, format });
      if (!result.success) {
        if (result.error.kind === 'not_found') {
          router.push('/specs');
          return;
        }
        console.error('exportSpecAction failed:', result.error);
        return;
      }
      const blob = new Blob([result.body], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(format === 'json' ? TOASTS.exportedJson : TOASTS.exportedYaml);
    });
  }

  const jsonVariant = spec.sourceFormat === 'json' ? 'default' : 'outline';
  const yamlVariant = spec.sourceFormat === 'yaml' ? 'default' : 'outline';

  return (
    <>
      <Button
        type="button"
        variant={jsonVariant}
        size="sm"
        disabled={pending}
        onClick={() => onExport('json')}
      >
        Export JSON
      </Button>
      <Button
        type="button"
        variant={yamlVariant}
        size="sm"
        disabled={pending}
        onClick={() => onExport('yaml')}
      >
        Export YAML
      </Button>
    </>
  );
}
