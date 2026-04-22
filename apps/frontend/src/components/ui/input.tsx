import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({
  className,
  type,
  suppressHydrationWarning = true,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
        className
      )}
      data-slot="input"
      suppressHydrationWarning={suppressHydrationWarning}
      type={type}
      {...props}
    />
  );
}

export { Input };
