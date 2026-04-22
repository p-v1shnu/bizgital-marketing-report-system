import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({
  className,
  suppressHydrationWarning = true,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
        className
      )}
      data-slot="textarea"
      suppressHydrationWarning={suppressHydrationWarning}
      {...props}
    />
  );
}

export { Textarea };
