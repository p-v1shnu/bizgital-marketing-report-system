import { AlertCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type WorkspaceUnavailableCardProps = {
  title: string;
  message: string;
};

export function WorkspaceUnavailableCard({
  title,
  message
}: WorkspaceUnavailableCardProps) {
  return (
    <Card className="border-rose-500/25 bg-rose-500/8">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <AlertCircle className="text-rose-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-6 text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
