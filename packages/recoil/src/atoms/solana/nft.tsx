import type {
  Nft,
  NftCollection,
  SolanaTokenAccountWithKeyString,
  TokenMetadataString,
} from "@coral-xyz/common";
import {
  Blockchain,
  externalResourceUri,
  metadataAddress,
  UNKNOWN_NFT_ICON_SRC,
} from "@coral-xyz/common";
import { MetadataData } from "@metaplex-foundation/mpl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import { selectorFamily } from "recoil";

import { equalSelectorFamily } from "../../equals";

import { customSplTokenAccounts } from "./token";
import { anchorContext } from "./wallet";
import { solanaConnectionUrl } from ".";

export const solanaWalletCollections = selectorFamily<
  {
    publicKey: string;
    collections: Array<NftCollection>;
  },
  { publicKey: string }
>({
  key: "solanaWalletCollections",
  get:
    ({ publicKey }) =>
    ({ get }) => {
      const metadataMap = get(solanaMetadataMap({ publicKey }));
      const { publicKey: pk, collections } =
        intoSolanaCollectionsMap(metadataMap);
      return {
        publicKey: pk,
        collections: Object.values(collections),
      };
    },
});

// Returns the nft metadata map for a given public key.
// Maps metadata pubkey -> account data.
const solanaMetadataMap = selectorFamily<MetadataMap, { publicKey: string }>({
  key: "metadataMap",
  get:
    ({ publicKey }) =>
    ({ get }) => {
      const connectionUrl = get(solanaConnectionUrl);
      const { nfts } = get(
        customSplTokenAccounts({ publicKey, connectionUrl })
      );
      // Transform into the map now.
      const nftMap = {};
      for (let k = 0; k < nfts.nftTokens.length; k += 1) {
        const nftToken = nfts.nftTokens[k];
        const nftTokenMetadata = nfts.nftTokenMetadata[k]!;
        if (nftTokenMetadata) {
          nftMap[nftTokenMetadata.publicKey] = {
            metadataPublicKey: nftTokenMetadata.publicKey,
            nftToken,
            nftTokenMetadata,
          };
        }
      }
      return {
        publicKey,
        metadata: nftMap,
      };
    },
});

export const solanaNftById = equalSelectorFamily<
  Nft,
  { publicKey: string; connectionUrl: string; nftId: string }
>({
  key: "nftById",
  get:
    ({ publicKey, connectionUrl, nftId }) =>
    async ({ get }) => {
      const { connection } = get(anchorContext);
      const metadataMap = get(solanaMetadataMap({ publicKey }));
      const { nftToken, nftTokenMetadata } = metadataMap.metadata[nftId];

      const resp = await connection.customSplMetadataUri(
        [nftToken],
        [nftTokenMetadata]
      );
      const [_, uriData] = resp[0] ?? [];
      const collectionName = (() => {
        if (!uriData) {
          return "";
        } else if (uriData.metadata.collection) {
          // TODO: there is a verified boolean on the object. We should probably check it.
          const metadata = get(
            solanaNftCollection({
              collectionPublicKey: uriData.metadata.collection.key.toString(),
            })
          );
          return metadata.data.name;
        } else if (uriData.tokenMetaUriData.collection) {
          return uriData.tokenMetaUriData?.collection?.name;
        } else {
          return uriData.metadata.data.name;
        }
      })();

      const nft = {
        id: nftTokenMetadata?.publicKey ?? "",
        blockchain: Blockchain.SOLANA,
        publicKey: nftToken.key,
        mint: nftTokenMetadata?.account.mint,
        name:
          nftTokenMetadata?.account.data.name ??
          (uriData ? uriData.tokenMetaUriData.name : "Unknown"),
        description: uriData ? uriData.tokenMetaUriData.description : "",
        externalUrl: uriData
          ? externalResourceUri(
              uriData.tokenMetaUriData.external_url?.replace(/\0/g, "")
            )
          : "",
        imageUrl:
          uriData && uriData.tokenMetaUriData.image
            ? externalResourceUri(
                uriData.tokenMetaUriData.image?.replace(/\0/g, "")
              )
            : UNKNOWN_NFT_ICON_SRC,
        attributes: uriData
          ? uriData.tokenMetaUriData.attributes?.map(
              (a: { trait_type: string; value: string }) => ({
                traitType: a.trait_type,
                value: a.value,
              })
            )
          : [],
        collectionName,
      };
      return nft;
    },
  equals: (m1, m2) => JSON.stringify(m1) === JSON.stringify(m2),
});

const solanaNftCollection = selectorFamily<
  MetadataData,
  { collectionPublicKey: string }
>({
  key: "solanaNftCollection",
  get:
    ({ collectionPublicKey }) =>
    async ({ get }) => {
      const { connection } = get(anchorContext);
      const collectionMetadataPublicKey = await metadataAddress(
        new PublicKey(collectionPublicKey)
      );
      const account = await connection.getAccountInfo(
        collectionMetadataPublicKey
      );
      if (account === null) {
        return null;
      }
      const metadata = MetadataData.deserialize(account.data);
      return metadata;
    },
});

////////////////////////////////////////////////////////////////////////////////
// Non-atom utils and types.
////////////////////////////////////////////////////////////////////////////////

// Given all the token account data for a given wallet, transform into a
// collection array for UI presentation.
function intoSolanaCollectionsMap(metadataMap: MetadataMap): {
  publicKey: string;
  collections: {
    [collectionId: string]: NftCollection;
  };
} {
  const collections = {};
  Object.values(metadataMap.metadata).forEach((value) => {
    const [collectionId, metadataCollectionId] = (() => {
      const collectionId = extractCollectionId(value.nftTokenMetadata!);
      const metadataCollectionId =
        value.nftTokenMetadata?.account.collection?.key || "";
      return [collectionId, metadataCollectionId];
    })();
    if (collectionId && !collections[collectionId]) {
      collections[collectionId] = {
        id: collectionId,
        metadataCollectionId,
        name: collectionId,
        symbol: value.nftTokenMetadata?.account.data.symbol,
        tokenType: "",
        totalSupply: "",
        itemIds: [],
      };
    }
    if (collectionId) {
      collections[collectionId]!.itemIds.push(
        value.nftTokenMetadata?.publicKey
      );
    }
  });
  return {
    publicKey: metadataMap.publicKey,
    collections,
  };
}

type MetadataMap = {
  publicKey: string;
  metadata: {
    [metadataPublicKey: string]: {
      metadataPublicKey: string;
      nftToken: SolanaTokenAccountWithKeyString;
      nftTokenMetadata: TokenMetadataString | null;
    };
  };
};

function extractCollectionId(
  tokenMetadata: TokenMetadataString
): string | null {
  const creators = tokenMetadata.account.data.creators;
  if (!creators) {
    return null;
  }
  const id = JSON.stringify(
    [...creators].sort((a, b) => a.address.localeCompare(b.address))
  );
  return id;
}
