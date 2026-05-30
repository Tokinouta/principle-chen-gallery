import type { ArtworkRow } from '../repositories/artworkRepository.js';
import type { ArtworkResponse } from '../types/artwork.js';
import type { OssSigner } from './ossSigner.js';
export declare function presentArtwork(row: ArtworkRow, signer: OssSigner): Promise<ArtworkResponse>;
export declare function presentArtworks(rows: ArtworkRow[], signer: OssSigner): Promise<ArtworkResponse[]>;
