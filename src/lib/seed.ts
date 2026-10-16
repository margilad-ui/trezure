import type { FieldDef } from './types'

export const SITES = [
  { name_he: 'בית', name_en: 'Home', code: 'HM', color: '#3FA34D' },
  { name_he: 'משרד', name_en: 'Office', code: 'OF', color: '#1EA5A0' },
  { name_he: 'מחסן', name_en: 'Storage', code: 'ST', color: '#9A6B3F' },
]

const f = (key: string, he: string, en: string, type: FieldDef['type'] = 'text', options?: string[], unit?: string): FieldDef =>
  ({ key, label_he: he, label_en: en, type, ...(options ? { options } : {}), ...(unit ? { unit } : {}) })

export interface SeedCategory {
  name_he: string; name_en: string; icon: string; color?: string
  default_unit: string; default_kind: 'equipment' | 'consumable'
  fields: FieldDef[]
  children?: SeedCategory[]
}

export const CATEGORIES: SeedCategory[] = [
  {
    name_he: 'Cricut', name_en: 'Cricut', icon: 'scissors', color: '#15A398', default_unit: 'unit', default_kind: 'equipment', fields: [],
    children: [
      { name_he: 'ויניל', name_en: 'Vinyl', icon: 'layers', default_unit: 'roll', default_kind: 'consumable',
        fields: [f('color', 'צבע', 'Color'), f('width_cm', 'רוחב', 'Width', 'number', undefined, 'cm'), f('length_m', 'אורך', 'Length', 'number', undefined, 'm'), f('type', 'סוג', 'Type', 'select', ['רגיל', 'HTV', 'גליטר', 'הולוגרפי', 'מט'])] },
      { name_he: 'להבים', name_en: 'Blades', icon: 'pen-tool', default_unit: 'unit', default_kind: 'equipment',
        fields: [f('blade_type', 'סוג להב', 'Blade type', 'select', ['Fine point', 'Deep point', 'Rotary', 'Knife', 'Foil', 'Scoring'])] },
      { name_he: 'מחצלות', name_en: 'Mats', icon: 'square', default_unit: 'unit', default_kind: 'equipment',
        fields: [f('grip', 'אחיזה', 'Grip', 'select', ['Light', 'Standard', 'Strong', 'Fabric']), f('size', 'גודל', 'Size', 'select', ['12x12', '12x24'])] },
    ],
  },
  {
    name_he: 'סובלימציה', name_en: 'Sublimation', icon: 'printer', color: '#E0557A', default_unit: 'unit', default_kind: 'equipment', fields: [],
    children: [
      { name_he: 'דיו', name_en: 'Ink', icon: 'droplet', default_unit: 'unit', default_kind: 'consumable',
        fields: [f('color', 'צבע', 'Color', 'select', ['Cyan', 'Magenta', 'Yellow', 'Black', 'Light Cyan', 'Light Magenta']), f('volume_ml', 'נפח', 'Volume', 'number', undefined, 'ml')] },
      { name_he: 'נייר', name_en: 'Paper', icon: 'file', default_unit: 'sheet', default_kind: 'consumable',
        fields: [f('size', 'גודל', 'Size', 'select', ['A4', 'A3', 'Letter']), f('gsm', 'משקל', 'Weight', 'number', undefined, 'gsm')] },
      { name_he: 'מוצרים ריקים', name_en: 'Blanks', icon: 'package', default_unit: 'unit', default_kind: 'consumable',
        fields: [f('blank_type', 'סוג', 'Type', 'select', ['ספל', 'חולצה', 'שלט', 'מחזיק מפתחות', 'פאזל', 'כרית', 'אחר']), f('color', 'צבע', 'Color')] },
    ],
  },
  { name_he: 'ציוד סדנאות', name_en: 'Workshop gear', icon: 'briefcase', color: '#E07B39', default_unit: 'unit', default_kind: 'equipment', fields: [f('for', 'לאיזו פעילות', 'For activity')] },
  { name_he: 'ציוד יצירה', name_en: 'Craft supplies', icon: 'palette', color: '#D9A520', default_unit: 'unit', default_kind: 'consumable', fields: [f('color', 'צבע', 'Color'), f('material', 'חומר', 'Material')] },
  { name_he: 'משחקי חברה', name_en: 'Board games', icon: 'dice-5', color: '#C7382E', default_unit: 'unit', default_kind: 'equipment',
    fields: [f('players', 'שחקנים', 'Players'), f('age', 'גיל', 'Age'), f('minutes', 'זמן', 'Time', 'number', undefined, 'min')] },
  { name_he: 'פאזלים', name_en: 'Puzzles', icon: 'puzzle', color: '#3B82F6', default_unit: 'unit', default_kind: 'equipment',
    fields: [f('pieces', 'חלקים', 'Pieces', 'number'), f('age', 'גיל', 'Age')] },
  { name_he: 'משחקי הרכבה', name_en: 'Building sets', icon: 'blocks', color: '#3FA34D', default_unit: 'set', default_kind: 'equipment',
    fields: [f('pieces', 'חלקים', 'Pieces', 'number'), f('set_no', 'מספר סט', 'Set number')] },
  { name_he: 'ציוד משרדי', name_en: 'Office supplies', icon: 'paperclip', color: '#7C6FDB', default_unit: 'unit', default_kind: 'consumable', fields: [] },
  { name_he: 'מתנות', name_en: 'Gifts', icon: 'gift', color: '#B14FC4', default_unit: 'unit', default_kind: 'equipment', fields: [f('for_whom', 'למי', 'For whom'), f('occasion', 'אירוע', 'Occasion')] },
  { name_he: 'אחר', name_en: 'Other', icon: 'box', color: '#9CA3AF', default_unit: 'unit', default_kind: 'equipment', fields: [] },
]

export const UNITS = ['unit', 'pack', 'roll', 'm', 'cm', 'ml', 'sheet', 'set', 'pair', 'box'] as const
