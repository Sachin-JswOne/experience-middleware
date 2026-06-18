/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  transformBuyAgainResponse,
  fetchQuantity,
  getProductType,
  getValue,
  getValueAndUom,
  getColourValue,
  getAttributesAndItsList,
} from '../buyAgain.transformers';

import { CT_ATTRIBUTES_MAPPING, PRODUCT_TYPES } from 'src/config/app.config';

describe('transformBuyAgainResponse', () => {
  it('should transform variantList into listOfBuyAgainProducts', () => {
    const response = {
      status: 'OK',
      data: {
        skuSize: 1,

        variantList: [
          {
            name: 'JSW Ordinary Portland Cement 43',
            productKey: 'JSW-ORDINARY-PORTLAND-CEMENT-43',
            productSlug: 'jsw-ordinary-portland-cement-43',
            variantKey: 'JSW-ORDINARY-PORTLAND-CEMENT-43',
            sku: 'JSW Ordinary Portland Cement 43',
            attributes: {},
            ctAttributes: {},
            quantityCard: {
              identifier: 'cement',
              displayName: 'Specify quantity (In bags)',
              measureUnit: 'NUMBER_OF_BAGS',
              hasDecimal: false,
            },
            attributesMeta: [],
            primaryUom: {
              unit: 'NUMBER_OF_BAGS',
              label: 'bags',
              value: 4,
              priceLabel: 'bag',
            },
            ctUom: {
              unit: 'NUMBER_OF_BAGS',
              label: 'NUMBER_OF_BAGS',
              value: 4,
              priceLabel: '',
            },
            orderPlacedDate: '2024-09-20 00:00:00',
            productMMID: '1016-10924-10007386',
            imageUrl:
              'https://storage.googleapis.com/public-jsw-msme-cms-storage-qa/Cement_bc78db9892/Cement_bc78db9892.png',
          },
        ],
      },
    };
    const result = transformBuyAgainResponse(response);

    expect(result).toHaveProperty('listOfBuyAgainProducts');
    expect(Array.isArray(result.listOfBuyAgainProducts)).toBe(true);
    expect(result.listOfBuyAgainProducts.length).toBeGreaterThan(0);

    const product = result.listOfBuyAgainProducts[0];

    const expectedProduct = {
      mmid: '1016-10924-10007386',
      displayName: 'JSW Ordinary Portland Cement 43',
      category: '',
      imageUrl: [
        {
          url: 'https://storage.googleapis.com/public-jsw-msme-cms-storage-qa/Cement_bc78db9892/Cement_bc78db9892.png',
        },
      ],
      quantity: 4,
      variantKey: 'JSW-ORDINARY-PORTLAND-CEMENT-43',
      attributes: [],
      listOfAttributes: [
        {
          displayName: '4 Bags',
          type: 'text',
        },
      ],
    };
    expect(product).toEqual(expectedProduct);
  });

  it('should return empty list if variantList is missing', () => {
    const result = transformBuyAgainResponse({ data: {} });

    expect(result).toEqual({
      listOfBuyAgainProducts: [],
    });
  });

  describe('fetchQuantity', () => {
    it('should return secondaryUom value when label is sheets', () => {
      const product = {
        secondaryUom: { label: 'sheets', value: 10 },
        primaryUom: { value: 5 },
      };

      expect(fetchQuantity(product)).toBe(10);
    });

    it('should return primaryUom value when secondaryUom is absent', () => {
      const product = {
        primaryUom: { value: 7 },
      };

      expect(fetchQuantity(product)).toBe(7);
    });

    it('should return 0 when neither UOM exists', () => {
      expect(fetchQuantity({})).toBe(0);
    });
  });

  describe('getProductType', () => {
    it('should return cement_bitumen when ctAttributes is empty', () => {
      expect(getProductType({ ctAttributes: {} })).toBe(PRODUCT_TYPES.cement_bitumen);
    });

    it('should detect TMT product', () => {
      const product = {
        name: 'JSW TMT Bar',
        ctAttributes: {
          [CT_ATTRIBUTES_MAPPING.form]: 'Straight',
        },
      };

      expect(getProductType(product)).toBe(PRODUCT_TYPES.tmt_pb_tmt);
    });

    it('should detect GI coils', () => {
      const product = {
        name: 'JSW Galvanized Steel Coil',
        ctAttributes: {
          [CT_ATTRIBUTES_MAPPING.thickness]: '1.1 mm',
          [CT_ATTRIBUTES_MAPPING.width]: '1950 mm',
          [CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gi]: '120 GSM',
          [CT_ATTRIBUTES_MAPPING.spangle_type]: 'Regular',
        },
      };

      expect(getProductType(product)).toBe(PRODUCT_TYPES.gi_coils);
    });

    it('should detect wire rod coils', () => {
      const product = {
        name: 'Steel Wire Rod',
        ctAttributes: {
          [CT_ATTRIBUTES_MAPPING.diameter]: '6 mm',
        },
      };

      expect(getProductType(product)).toBe(PRODUCT_TYPES.wire_rod_coils);
    });
  });

  describe('value helpers', () => {
    const product = {
      ctAttributes: {
        WIDTH_MM: '1250 mm',
        COLOUR: 'Mist_Green-#697f5b',
      },
    };

    it('getValue should return only numeric part', () => {
      expect(getValue(product, 'WIDTH_MM')).toBe('1250');
    });

    it('getValueAndUom should return value and uom', () => {
      expect(getValueAndUom(product, 'WIDTH_MM')).toEqual({ value: '1250', uom: 'mm' });
    });

    it('getColourValue should split colour and hex', () => {
      expect(getColourValue(product, 'COLOUR')).toEqual(['Mist_Green', '#697f5b']);
    });
  });

  describe('getAttributesAndItsList', () => {
    it('should return attributes and listOfAttributes for TMT', () => {
      const product = {
        name: 'JSW TMT',
        variantKey: 'TMT-32',
        ctAttributes: {
          DIAMETER_MM: '32 mm',
          TMT_FORM: 'Straight',
        },
        primaryUom: { label: 'MT', value: 2 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 2);

      expect(attributes.length).toBeGreaterThan(0);
      expect(list.length).toBeGreaterThan(0);

      expect(list[0]).toMatchObject({
        displayName: expect.stringContaining('2'),
        type: 'text',
      });
    });

    it('should return attributes for cement/bitumen', () => {
      const product = {
        name: 'JSW Cement',
        ctAttributes: {},
        primaryUom: { label: 'NUMBER_OF_BAGS', value: 10 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 10);

      expect(attributes).toEqual([]);
      expect(list).toHaveLength(1);
      expect(list[0].displayName).toContain('10');
    });

    it('should return attributes for MS/SS coils', () => {
      const product = {
        name: 'Hot Rolled Coil',
        ctAttributes: {
          THICKNESS_MM: '2 mm',
          WIDTH_MM: '1250 mm',
        },
        primaryUom: { label: 'MT', value: 3 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 3);

      expect(attributes).toHaveLength(2);
      expect(list[1].displayName).toContain('2x1250');
    });

    it('should return attributes for MS/SS sheets', () => {
      const product = {
        name: 'Hot Rolled Sheet',
        ctAttributes: {
          THICKNESS_MM: '2.5 mm',
          WIDTH_MM: '1250 mm',
          LENGTH_MM: '2500 mm',
        },
        secondaryUom: { label: 'sheets', value: 10 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 10);

      expect(attributes).toHaveLength(3);
      expect(list[1].displayName).toContain('2.5x1250x2500');
    });

    it('should return attributes for GI coils', () => {
      const product = {
        name: 'GI Coil',
        ctAttributes: {
          THICKNESS_MM: '1.1 mm',
          WIDTH_MM: '1950 mm',
          S_ZN_COATING_GSM_MIN: '120 GSM',
          SPANGLE_TYPE: 'Regular',
        },
        primaryUom: { label: 'MT', value: 5 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 5);

      expect(attributes).toHaveLength(4);
      expect(list).toHaveLength(4);
    });

    it('should return attributes for GI sheets', () => {
      const product = {
        name: 'GI Sheet',
        ctAttributes: {
          THICKNESS_MM: '2 mm',
          WIDTH_MM: '1150 mm',
          LENGTH_MM: '1555 mm',
          S_ZN_COATING_GSM_MIN: '150 GSM',
          SPANGLE_TYPE: 'Skinpass',
        },
        secondaryUom: { label: 'sheets', value: 7 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 7);

      expect(attributes).toHaveLength(5);
      expect(list.length).toBeGreaterThanOrEqual(3);
    });

    it('should return attributes for GL coils', () => {
      const product = {
        name: 'GL Coil',
        ctAttributes: {
          THICKNESS_MM: '1.2 mm',
          WIDTH_MM: '1950 mm',
          S_AL_ZN_COATING_GSM_MIN: '190 GSM',
        },
        primaryUom: { label: 'MT', value: 8 },
      };

      const [attributes] = getAttributesAndItsList(product, 8);

      expect(attributes).toHaveLength(3);
    });

    it('should return attributes for GL sheets', () => {
      const product = {
        name: 'GL Sheet',
        ctAttributes: {
          THICKNESS_MM: '3 mm',
          WIDTH_MM: '980 mm',
          LENGTH_MM: '1280 mm',
          S_AL_ZN_COATING_GSM_MIN: '180 GSM',
        },
        secondaryUom: { label: 'sheets', value: 7 },
      };

      const [attributes] = getAttributesAndItsList(product, 7);

      expect(attributes).toHaveLength(4);
    });

    it('should return attributes for PPGL coils', () => {
      const product = {
        name: 'PPGL Coil',
        ctAttributes: {
          THICKNESS_MM: '1.4 mm',
          WIDTH_MM: '2100 mm',
          S_AL_ZN_COATING_GSM_MIN: '200 GSM',
          S_COLOUR_CODE_TOP: 'Mist_Green-#697f5b',
        },
        primaryUom: { label: 'MT', value: 6 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 6);
      expect(attributes.some((a) => a.displayName.includes('Colour'))).toBe(true);
      expect(list.some((l) => l.type === 'colour')).toBe(true);
    });

    it('should return attributes for PPGL sheets', () => {
      const product = {
        name: 'PPGL Sheet',
        ctAttributes: {
          THICKNESS_MM: '2.4 mm',
          WIDTH_MM: '2111 mm',
          LENGTH_MM: '900 mm',
          S_AL_ZN_COATING_GSM_MIN: '220 GSM',
          S_COLOUR_CODE_TOP: 'Sky_Blue-#87ceeb',
        },
        secondaryUom: { label: 'sheets', value: 7 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 7);

      expect(attributes).toHaveLength(5);
      expect(list.some((l) => l.type === 'colour')).toBe(true);
    });

    it('should return attributes for wire rod coils', () => {
      const product = {
        name: 'Steel Wire Rod',
        ctAttributes: {
          DIAMETER_MM: '6 mm',
        },
        primaryUom: { label: 'MT', value: 11 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 11);

      expect(attributes).toHaveLength(1);
      expect(list[1].displayName).toContain('6');
    });

    it('should return attributes for angles', () => {
      const product = {
        name: 'Steel Angle',
        ctAttributes: {
          LEG1_MM: '110 mm',
          THICKNESS_MM: '3.4 mm',
          LENGTH_MM: '200 mm',
        },
        primaryUom: { label: 'MT', value: 10 },
      };

      const [attributes] = getAttributesAndItsList(product, 10);

      expect(attributes).toHaveLength(3);
    });

    it('should return attributes for channels/beams/columns', () => {
      const product = {
        name: 'Steel Beam',
        ctAttributes: {
          FLANGE_WIDTH_MM: '1110 mm',
          WEB_DEPTH_MM: '3.4 mm',
          SECTIONAL_WEIGHT_KG_PER_M: '200 kg/m',
          LENGTH_MM: '1000 mm',
        },
        primaryUom: { label: 'MT', value: 11 },
      };

      const [attributes, list] = getAttributesAndItsList(product, 11);

      expect(attributes).toHaveLength(4);
      expect(list.length).toBeGreaterThan(1);
    });
  });
});
