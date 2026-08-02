import { verifyFirebaseIdToken } from './src/shared/integrations/firebase';

async function test() {
  try {
    await verifyFirebaseIdToken("invalid.token.here");
    console.log("Success");
  } catch (err: any) {
    console.log("Error message:", err?.message);
  }
}
test();
