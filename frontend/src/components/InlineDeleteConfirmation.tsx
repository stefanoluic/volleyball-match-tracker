import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { useEffect, useId, useRef } from 'react';

export function InlineDeleteConfirmation({ title, question, warning, error, busy, confirmLabel, onCancel, onConfirm }: {
  title: string;
  question: string;
  warning: string;
  error: string;
  busy: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <Stack component="section" aria-labelledby={id} gap="sm" className="inline-delete-confirmation"
      onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel(); }}>
      <Group gap={8} wrap="nowrap">
        <IconTrash size={18} color="var(--mantine-color-red-7)" aria-hidden="true" />
        <Title order={3} size="h5" c="red.8" id={id} ref={heading} tabIndex={-1}>{title}</Title>
      </Group>
      <Text size="sm" className="team-name">{question}</Text>
      <Text size="xs" c="dimmed">{warning}</Text>
      {error && <Alert color="red" icon={<IconAlertCircle size={16} aria-hidden="true" />} role="alert">{error}</Alert>}
      <Group gap="xs">
        <Button variant="default" size="xs" disabled={busy} onClick={onCancel}>Odustani</Button>
        <Button color="red" size="xs" loading={busy} leftSection={<IconTrash size={15} aria-hidden="true" />}
          onClick={onConfirm}>{confirmLabel}</Button>
      </Group>
    </Stack>
  );
}
