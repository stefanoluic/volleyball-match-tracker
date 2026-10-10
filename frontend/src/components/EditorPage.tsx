import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { Fragment, useEffect, useId, useRef, type ReactNode } from 'react';

interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

export function EditorPage({ title, description, category, icon, breadcrumbs, busy, children }: {
  title: string;
  description: string;
  category: string;
  icon: ReactNode;
  breadcrumbs: Breadcrumb[];
  busy: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <Stack gap="xl" className="editor-page">
      <nav aria-label="Putanja">
        <Group gap={6} className="editor-breadcrumbs">
          {breadcrumbs.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <IconChevronRight size={14} aria-hidden="true" />}
              {item.onClick ? (
                <Button variant="subtle" size="compact-sm" disabled={busy} onClick={item.onClick}>{item.label}</Button>
              ) : <Text size="sm" c="dimmed">{item.label}</Text>}
            </Fragment>
          ))}
          <IconChevronRight size={14} aria-hidden="true" />
          <Text size="sm" fw={600} aria-current="page">{title}</Text>
        </Group>
      </nav>
      <Paper withBorder className="editor-panel" aria-labelledby={id}>
        <header className="editor-panel-header">
          <div className="editor-symbol" aria-hidden="true">{icon}</div>
          <div className="page-heading editor-header-copy">
            <Text className="editor-eyebrow">{category}</Text>
            <Title order={1} size="h2" id={id} ref={heading} tabIndex={-1} className="editor-heading">{title}</Title>
            <Text c="dimmed" size="sm" mt={8}>{description}</Text>
          </div>
        </header>
        <div className="editor-panel-body">{children}</div>
      </Paper>
    </Stack>
  );
}
