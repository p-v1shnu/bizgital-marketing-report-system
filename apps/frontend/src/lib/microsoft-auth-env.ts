function firstDefinedValue(values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function readMicrosoftAuthEnv() {
  const clientId = firstDefinedValue([
    process.env.MICROSOFT_CLIENT_ID,
    process.env.AZURE_AD_CLIENT_ID
  ]);
  const clientSecret = firstDefinedValue([
    process.env.MICROSOFT_CLIENT_SECRET,
    process.env.AZURE_AD_CLIENT_SECRET
  ]);
  const tenantId = firstDefinedValue([
    process.env.MICROSOFT_TENANT_ID,
    process.env.AZURE_AD_TENANT_ID
  ]);
  const redirectUri = firstDefinedValue([process.env.MICROSOFT_REDIRECT_URI]);

  return {
    clientId,
    clientSecret,
    tenantId,
    redirectUri
  };
}

export function isMicrosoftAuthConfigured() {
  const credentials = readMicrosoftAuthEnv();
  return !!credentials.clientId && !!credentials.clientSecret && !!credentials.tenantId;
}
