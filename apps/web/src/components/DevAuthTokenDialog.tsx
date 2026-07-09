import { useEffect, useState } from 'react';
import { getStoredDevAuthToken, setStoredDevAuthToken } from '@/auth-token.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type DevAuthTokenDialogProps = {
  ledgerMode: 'demo' | 'fabric' | null;
  apiOnline: boolean;
};

export function DevAuthTokenDialog({ ledgerMode, apiOnline }: DevAuthTokenDialogProps) {
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setToken(getStoredDevAuthToken());
    setSaved(false);
  }, [ledgerMode, apiOnline]);

  if (!apiOnline || ledgerMode !== 'fabric') {
    return null;
  }

  const hasToken = token.trim().length > 0;

  return (
    <div className="border-b border-border bg-warning/10 px-4 py-3 md:px-8">
      {!hasToken ? (
        <Alert variant="warning">
          <AlertTitle>Fabric mode requires an API token</AlertTitle>
          <AlertDescription>
            Set the same value as <code className="text-xs">PDS_DEV_AUTH_TOKEN</code> on the API server.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="dev-auth-token">API bearer token</Label>
          <Input
            id="dev-auth-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              setSaved(false);
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setStoredDevAuthToken(token.trim());
            setSaved(true);
          }}
        >
          {saved ? 'Saved' : 'Save token'}
        </Button>
      </div>
    </div>
  );
}
