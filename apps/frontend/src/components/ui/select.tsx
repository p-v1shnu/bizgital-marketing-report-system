import * as React from 'react';

import { cn } from '@/lib/utils';

function Select({
  className,
  suppressHydrationWarning = true,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60',
        className
      )}
      data-slot="select"
      suppressHydrationWarning={suppressHydrationWarning}
      {...props}
    />
  );
}

export { Select };
