import { useEffect, useState } from "react";
import type { Blockchain } from "@coral-xyz/common";
import {
  BACKEND_API_URL,
  getAddMessage,
  UI_RPC_METHOD_KEYRING_KEY_DELETE,
  UI_RPC_METHOD_SIGN_MESSAGE_FOR_PUBLIC_KEY,
} from "@coral-xyz/common";
import { Loading } from "@coral-xyz/react-common";
import { useBackgroundClient } from "@coral-xyz/recoil";
import { ethers } from "ethers";

import { useAuthentication } from "../../hooks/useAuthentication";

const { base58 } = ethers.utils;

export function WithSyncAccount({
  serverPublicKeys,
  children,
}: {
  serverPublicKeys: Array<{ blockchain: Blockchain; publicKey: string }>;
  children: React.ReactElement;
}) {
  const background = useBackgroundClient();
  const { getSigners } = useAuthentication();
  const [loading, setLoading] = useState(true);
  const [clientPublicKeys, setClientPublicKeys] = useState<
    Array<{ blockchain: Blockchain; publicKey: string; hardware: boolean }>
  >([]);

  useEffect(() => {
    (async () => {
      setClientPublicKeys(await getSigners());
    })();
  }, []);

  /**
   * Sign all transparently signable add messages with the required public keys.
   */
  useEffect(() => {
    (async () => {
      // Public key/signature pairs that are required to sync the state of the
      // server public key data with the client data.
      const danglingPublicKeys = clientPublicKeys.filter((c) => {
        // Filter to client public keys that don't exist on the server
        const existsServer = serverPublicKeys.find(
          (s) => s.blockchain === c.blockchain && s.publicKey === c.publicKey
        );
        return !existsServer;
      });

      if (danglingPublicKeys.length === 0) {
        // Nothing left to sign
        setLoading(false);
      } else {
        for (const danglingPublicKey of danglingPublicKeys) {
          if (danglingPublicKey.hardware) {
            // Remove hardware public keys if they are not on the server
            // They can be added again through settings to capture the
            // signature
            await background.request({
              method: UI_RPC_METHOD_KEYRING_KEY_DELETE,
              params: [
                danglingPublicKey.blockchain,
                danglingPublicKey.publicKey,
              ],
            });
          } else {
            // Sync all transparently signable public keys by adding them
            // to the server
            addPublicKeyToAccount(
              danglingPublicKey.blockchain,
              danglingPublicKey.publicKey
            );
          }
        }
      }
    })();
  }, [clientPublicKeys]);

  // Add a public key to a Backpack account
  const addPublicKeyToAccount = async (
    blockchain: Blockchain,
    publicKey: string,
    signature?: string
  ) => {
    if (!signature) {
      const signature = await background.request({
        method: UI_RPC_METHOD_SIGN_MESSAGE_FOR_PUBLIC_KEY,
        params: [
          blockchain,
          base58.encode(Buffer.from(getAddMessage(publicKey), "utf-8")),
          publicKey,
        ],
      });

      const response = await fetch(`${BACKEND_API_URL}/users/publicKeys`, {
        method: "POST",
        body: JSON.stringify({
          blockchain,
          signature,
          publicKey,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error((await response.json()).msg);
      }
    }
  };

  return loading ? <Loading /> : children;
}
