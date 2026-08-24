import type { PhotoFilterId } from './filters'
import type { EditRecord as SharedEditRecord, EditRecipe as SharedEditRecipe, SaveEditResponse as SharedSaveEditResponse, StickerPlacement as SharedStickerPlacement } from '../../../../packages/contracts/session'


export type StickerPlacement = SharedStickerPlacement

export type EditRecipe = SharedEditRecipe & {
  filter?: PhotoFilterId
}

export type MockSticker = {
  id: string
  label: string
  src: string
  /** Default width as fraction of photo short edge */
  baseSize: number
}

export type EditRecord = SharedEditRecord & {
  recipe: EditRecipe
}

export type SaveEditResponse = SharedSaveEditResponse & {
  recipe: EditRecipe
}
