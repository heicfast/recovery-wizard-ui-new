import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CloudOffIcon, FolderOpenIcon, HardDriveIcon, ShieldAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/format';
import type { DestinationValidation } from '@/connector/contract';
import { useMountPoints, usePickDirectory, useValidateDestination } from '@/queries/system';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Segmented } from '@/components/ui/stepper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Destination dialog (corpus: modal over the results surface — recovery-destdlg-*).
 * Local tab: destination rows (radio + label + used/total + overlap warning),
 * "Choose folder…" row, manual path with live connector validation.
 * Cloud tab: truthful unavailable state — the connector exposes no cloud
 * targets yet (UI-MAP §0 divergence); the tab renders a reason, never a lie.
 * Save stays disabled until the connector validates the destination — the
 * overlap refusal is a hard gate the UI cannot override.
 */

export function DestinationDialog({
  open,
  onOpenChange,
  sourceTargetId,
  estimatedBytes,
  fileCount,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTargetId: string | null;
  estimatedBytes: number | null;
  fileCount: number | null;
  onConfirmed: (path: string) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = React.useState<'local' | 'cloud'>('local');
  const [path, setPath] = React.useState('');
  const [validation, setValidation] = React.useState<DestinationValidation | null>(null);
  const [validating, setValidating] = React.useState(false);

  const mounts = useMountPoints();
  const validateDestination = useValidateDestination(sourceTargetId ?? 'none');
  const pickDirectory = usePickDirectory();

  const validate = (candidate: string): void => {
    if (!candidate) {
      setValidation(null);
      return;
    }
    setValidating(true);
    validateDestination.mutate(
      { path: candidate, neededBytes: estimatedBytes ?? 40_000_000_000 },
      {
        onSuccess: (v) => setValidation(v),
        onError: () =>
          setValidation({
            allowed: false,
            reason: 'invalid',
            freeBytes: null,
            neededBytes: null,
          }),
        onSettled: () => setValidating(false),
      },
    );
  };

  const selectRow = (rowPath: string): void => {
    setPath(rowPath);
    validate(rowPath);
  };

  const saveDisabled = !path || validating || (validation !== null && !validation.allowed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[92vw]">
        <DialogHeader>
          <DialogTitle>{t('recovery.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {fileCount != null && fileCount > 0
              ? t('recovery.dialogDescription', {
                  count: fileCount,
                  size: formatBytes(estimatedBytes ?? 0, i18n.language),
                })
              : t('results.status.recoverAll')}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3">
          <Segmented
            ariaLabel={t('recovery.destination')}
            value={tab}
            onChange={(v) => setTab(v)}
            options={[
              { value: 'local', label: t('recovery.tabLocal') },
              { value: 'cloud', label: t('recovery.tabCloud') },
            ]}
          />
        </div>

        {tab === 'local' ? (
          <div
            className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1"
            role="radiogroup"
            aria-label={t('recovery.destination')}
          >
            {mounts.isLoading ? (
              Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)
            ) : (
              <>
                {mounts.data?.map((m) => (
                  <DestinationDialogRow
                    key={m.id}
                    icon={<HardDriveIcon className="size-5 text-primary" aria-hidden />}
                    label={m.label}
                    detail={t('home.capacityUsed', {
                      used: formatBytes(Math.max(0, m.totalBytes - m.freeBytes), i18n.language),
                      total: formatBytes(m.totalBytes, i18n.language),
                    })}
                    path={m.path}
                    selected={path === m.path}
                    warning={path === m.path && validation?.reason === 'overlap'}
                    onSelect={() => selectRow(m.path)}
                  />
                ))}

                <DestinationDialogRow
                  icon={<FolderOpenIcon className="size-5 text-primary" aria-hidden />}
                  label={t('recovery.chooseFolder')}
                  detail={t('recovery.dialogPickHint')}
                  path={null}
                  selected={false}
                  warning={false}
                  onSelect={() => {
                    pickDirectory.mutate(
                      { excludeDeviceId: sourceTargetId ?? null },
                      {
                        onSuccess: (picked) => {
                          if (picked) selectRow(picked);
                        },
                      },
                    );
                  }}
                />

                <div className="grid grid-cols-[1fr_auto] items-end gap-2 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="dest-dialog-path">{t('recovery.pathLabel')}</Label>
                    <Input
                      id="dest-dialog-path"
                      value={path}
                      placeholder="D:\\Recovered Files"
                      onChange={(e) => setPath(e.target.value)}
                      onBlur={() => validate(path)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                {validating ? (
                  <p className="pt-1 text-xs text-foreground-secondary">
                    {t('recovery.validating')}
                  </p>
                ) : null}

                {validation && !validation.allowed ? (
                  <p className="pt-1 text-xs font-medium text-danger" role="alert">
                    {validation.reason === 'overlap'
                      ? t('recovery.overlapRefused')
                      : validation.reason === 'out-of-space'
                        ? t('recovery.insufficientSpace')
                        : t('errors.unknown')}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div
            className="flex max-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-center"
            aria-live="polite"
          >
            <CloudOffIcon className="size-8 text-foreground-secondary" aria-hidden />
            <p className="text-sm font-medium">{t('recovery.cloudUnavailableTitle')}</p>
            <p className="max-w-sm text-xs text-foreground-secondary">
              {t('recovery.cloudUnavailableBody')}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={saveDisabled}
            title={saveDisabled ? t('recovery.destinationRequired') : undefined}
            onClick={() => {
              if (path && validation?.allowed) onConfirmed(path);
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinationDialogRow({
  icon,
  label,
  detail,
  path,
  selected,
  warning,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  path: string | null;
  selected: boolean;
  warning: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border-2 bg-surface p-3 text-left transition-colors',
        'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary' : 'border-transparent',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          selected ? 'border-primary' : 'border-border-strong',
        )}
        aria-hidden
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{label}</span>
          {warning ? <ShieldAlertIcon className="size-4 text-danger" aria-hidden /> : null}
        </span>
        {path ? (
          <span className="block truncate font-mono text-2xs text-foreground-secondary">
            {path}
          </span>
        ) : null}
        <span className="block truncate text-2xs text-foreground-secondary tabular">
          {detail}
        </span>
      </span>
    </button>
  );
}
