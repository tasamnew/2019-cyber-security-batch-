'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/hooks/use-socket';
import { Spinner } from '@/components/ui';
import { formatBytes, cn } from '@/lib/utils';

interface Settings {
  siteName: string;
  registrationOpen: boolean;
  requireApproval: boolean;
  maintenanceMode: boolean;
  allowGuests: boolean;
  maxUploadMb: number;
}

export function SettingsClient({
  initialSettings,
  sessions,
  storage,
}: {
  initialSettings: Settings;
  sessions: number;
  storage: { fileCount: number; totalBytes: number };
}) {
  const { push } = useToast();

  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(settings) !== JSON.stringify(initialSettings);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch<{ settings: Settings }>('/api/admin/settings', {
        method: 'PATCH',
        json: settings,
      });
      setSettings(data.settings);
      push('Settings saved.', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-text-primary">General</h2>

        <div>
          <label htmlFor="st-name" className="label">
            Site name
          </label>
          <input
            id="st-name"
            className="input"
            maxLength={60}
            value={settings.siteName}
            onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
          />
          <p className="mt-1 text-xs text-text-tertiary">
            Shown in the sidebar, the landing page and the browser title.
          </p>
        </div>

        <div>
          <label htmlFor="st-upload" className="label">
            Maximum upload size (MB)
          </label>
          <input
            id="st-upload"
            type="number"
            min={1}
            max={500}
            className="input sm:w-40"
            value={settings.maxUploadMb}
            onChange={(e) => setSettings({ ...settings, maxUploadMb: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-text-primary">Access</h2>

        <Toggle
          id="st-reg"
          label="Registration open"
          hint="When off, the sign-up form is hidden and the register endpoint rejects new accounts."
          checked={settings.registrationOpen}
          onChange={(v) => setSettings({ ...settings, registrationOpen: v })}
        />

        <Toggle
          id="st-approval"
          label="Require admin approval"
          hint="New accounts land in a pending state and cannot sign in until approved."
          checked={settings.requireApproval}
          onChange={(v) => setSettings({ ...settings, requireApproval: v })}
        />

        <Toggle
          id="st-guests"
          label="Allow guest accounts"
          hint="Guests can read public content but cannot post, chat or upload."
          checked={settings.allowGuests}
          onChange={(v) => setSettings({ ...settings, allowGuests: v })}
        />

        <Toggle
          id="st-maint"
          label="Maintenance mode"
          hint="Shows a maintenance notice to members. Admins keep full access."
          checked={settings.maintenanceMode}
          onChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
          tone="amber"
        />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-text-primary">Storage</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Fact label="Stored files" value={String(storage.fileCount)} />
          <Fact label="Total size" value={formatBytes(storage.totalBytes)} />
          <Fact label="Active sessions" value={String(sessions)} />
        </div>
        <p className="mt-3 text-xs text-text-tertiary">
          Deleting a file record also removes the bytes from disk. Runs are cleaned up on a schedule by
          your host — nothing else removes orphaned uploads.
        </p>
      </section>

      <button type="submit" className="btn-primary" disabled={saving || !dirty}>
        {saving ? <Spinner /> : 'Save settings'}
      </button>
    </form>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
  tone = 'green',
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: 'green' | 'amber';
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition',
          checked ? (tone === 'amber' ? 'bg-accent-amber' : 'bg-accent-green') : 'bg-slate-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-slate-950 transition-all',
            checked ? 'left-[1.4rem]' : 'left-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        <span className="block text-xs text-text-tertiary">{hint}</span>
      </span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-accent-green">{value}</p>
    </div>
  );
}