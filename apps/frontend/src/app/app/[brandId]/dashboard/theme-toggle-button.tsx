'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

type DashboardThemeToggleProps = {
  scopeId: string;
};

const STORAGE_KEY = 'dashboard-export-theme';

function applyScopeTheme(scopeId: string, isLightMode: boolean) {
  const scope = document.getElementById(scopeId);
  if (!scope) {
    return;
  }

  scope.setAttribute('data-dashboard-export-theme', isLightMode ? 'light' : 'dark');
}

export function DashboardThemeToggle({ scopeId }: DashboardThemeToggleProps) {
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const savedAsLight = savedTheme === 'light';
    setIsLightMode(savedAsLight);
    applyScopeTheme(scopeId, savedAsLight);
  }, [scopeId]);

  useEffect(() => {
    applyScopeTheme(scopeId, isLightMode);
    window.localStorage.setItem(STORAGE_KEY, isLightMode ? 'light' : 'dark');
  }, [isLightMode, scopeId]);

  return (
    <Button
      className="min-w-[168px] justify-center gap-2"
      onClick={() => setIsLightMode((current) => !current)}
      size="sm"
      type="button"
      variant={isLightMode ? 'default' : 'outline'}
    >
      {isLightMode ? (
        <Sun aria-hidden className="size-4" />
      ) : (
        <Moon aria-hidden className="size-4" />
      )}
      {isLightMode ? 'Light mode on' : 'Light mode off'}
    </Button>
  );
}
