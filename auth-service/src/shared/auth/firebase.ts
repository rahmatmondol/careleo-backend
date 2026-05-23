import { ValidationError } from '../errors';

/**
 * Placeholder Firebase verifier.
 * For now accepts development token: dev-firebase:<email>[:name]
 */
export const verifyFirebaseIdToken = async (idToken: string) => {
  if (!idToken.startsWith('dev-firebase:')) {
    throw new ValidationError('Firebase verification is not configured. Use dev-firebase:<email>[:name] for local testing.');
  }

  const [, email = '', name = 'Careleo User'] = idToken.split(':');
  if (!email) throw new ValidationError('Invalid dev firebase token format');

  return {
    uid: `dev-${email}`,
    email,
    name,
    phone_number: null,
    firebase: {
      sign_in_provider: 'google.com',
    },
  };
};
