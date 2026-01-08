/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { safeDebug } from 'src/utils/common-functions.util';
import { Logger } from '@nestjs/common';
import {
  CT_ATTRIBUTES_MAPPING,
  KEY_AND_DISPLAY_NAME_MAPPING,
  PRODUCT_TYPES,
  UOM_LIST,
} from 'src/config/app.config';

export function transformBuyAgainResponse(response: any) {
  const buyAgainResponse = response?.data;
  safeDebug(
    Logger,
    () =>
      ` CCP Buy Again Api response from method: transformBuyAgainResponse : ${JSON.stringify(
        buyAgainResponse,
      )}`,
  );
  if (!buyAgainResponse || !buyAgainResponse.variantList) {
    Logger.error(
      `Error for method: transformBuyAgainResponse, CCP Buy Again Api response is failing'`,
    );
    return {
      listOfBuyAgainProducts: [],
    };
  }

  if (buyAgainResponse.variantList.length > 0) {
    const transformedResponse = buyAgainResponse.variantList.map((item) => {
      const quantity = fetchQuantity(item);
      const [attributes, listOfAttributes] = getAttributesAndItsList(item, quantity);
      return {
        mmid: item.productMMID,
        displayName: item.name,
        slug: item.productSlug || '',
        imageUrl: [
          {
            url: item.imageUrl || '',
          },
        ],
        quantity: quantity,
        variantKey: item.variantKey,
        attributes: attributes,
        listOfAttributesToDisplay: listOfAttributes,
      };
    });

    return {
      listOfBuyAgainProducts: transformedResponse,
    };
  }
  return {
    listOfBuyAgainProducts: [],
  };
}

export function fetchQuantity(ccpBuyAgainApiProduct) {
  let quantity = 0;
  if (ccpBuyAgainApiProduct?.secondaryUom) {
    const ccpSecondaryQuantityLabel = ccpBuyAgainApiProduct?.secondaryUom?.label?.toLowerCase();
    if (ccpSecondaryQuantityLabel === 'sheets') {
      quantity = ccpBuyAgainApiProduct?.secondaryUom?.value as number;
      return quantity;
    }
  }
  if (ccpBuyAgainApiProduct?.primaryUom) {
    quantity = ccpBuyAgainApiProduct?.primaryUom?.value;
    return quantity;
  }
  return quantity;
}

export function getProductType(ccpBuyAgainApiProduct): string {
  const ctAttributes = ccpBuyAgainApiProduct?.ctAttributes || {};
  const keys = Object.keys(ctAttributes);

  if (!keys || keys.length === 0) {
    return PRODUCT_TYPES.cement_bitumen;
  }
  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.form) ||
    ccpBuyAgainApiProduct.name.toLowerCase().includes('tmt')
  )
    return PRODUCT_TYPES.tmt_pb_tmt;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    !keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gi) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.spangle_type)
  )
    return PRODUCT_TYPES.gi_coils;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gi) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.spangle_type)
  )
    return PRODUCT_TYPES.gi_sheets;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    !keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.colour)
  )
    return PRODUCT_TYPES.ppgl_coils;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.colour)
  )
    return PRODUCT_TYPES.ppgl_sheets;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    !keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl)
  )
    return PRODUCT_TYPES.gl_coils;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.length) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl)
  )
    return PRODUCT_TYPES.gl_sheets;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    !keys.includes(CT_ATTRIBUTES_MAPPING.length)
  )
    return PRODUCT_TYPES.ms_ss_hr_cr_coils;

  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.thickness) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.width) &&
    keys.includes(CT_ATTRIBUTES_MAPPING.length)
  )
    return PRODUCT_TYPES.ms_ss_hr_cr_sheets;
  if (
    keys.includes(CT_ATTRIBUTES_MAPPING.diameter) &&
    ccpBuyAgainApiProduct.name.toLowerCase().includes('wire')
  )
    return PRODUCT_TYPES.wire_rod_coils;

  if (keys.includes(CT_ATTRIBUTES_MAPPING.leg)) return PRODUCT_TYPES.angles;

  if (keys.includes(CT_ATTRIBUTES_MAPPING.flange_width))
    return PRODUCT_TYPES.channels_beams_and_columns;
  return PRODUCT_TYPES.default;
}

export function getAttributesAndItsList(ccpBuyAgainApiProduct, quantity: number): [any[], any[]] {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const productType = getProductType(ccpBuyAgainApiProduct);

  switch (productType) {
    case PRODUCT_TYPES.cement_bitumen:
      listOfAttributes.push({
        displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
        type: 'text',
      });
      return [attributes, listOfAttributes];

    case PRODUCT_TYPES.tmt_pb_tmt: {
      const [tmtAttributes, tmtListOfAttributes] = getAttributesAndItsListForTmtAndPbTmt(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [tmtAttributes, tmtListOfAttributes];
    }

    case PRODUCT_TYPES.ms_ss_hr_cr_coils: {
      const [coilAttributes, coilListOfAttributes] = getAttributesAndItsListForAllCoils(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [coilAttributes, coilListOfAttributes];
    }

    case PRODUCT_TYPES.ms_ss_hr_cr_sheets: {
      const [sheetAttributes, sheetListOfAttributes] = getAttributesAndItsListForAllSheets(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [sheetAttributes, sheetListOfAttributes];
    }

    case PRODUCT_TYPES.gi_coils: {
      const [giCoilAttributes, giCoilListOfAttributes] = getAttributesAndItsListForGiCoils(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [giCoilAttributes, giCoilListOfAttributes];
    }

    case PRODUCT_TYPES.gi_sheets: {
      const [giSheetsAttributes, giSheetsListOfAttributes] = getAttributesAndItsListForGiSheets(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [giSheetsAttributes, giSheetsListOfAttributes];
    }

    case PRODUCT_TYPES.gl_coils: {
      const [glCoilAttributes, glCoilListOfAttributes] = getAttributesAndItsListForGlCoils(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [glCoilAttributes, glCoilListOfAttributes];
    }

    case PRODUCT_TYPES.gl_sheets: {
      const [glSheetAttributes, glSheetListOfAttributes] = getAttributesAndItsListForGlSheets(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [glSheetAttributes, glSheetListOfAttributes];
    }

    case PRODUCT_TYPES.ppgl_coils: {
      const [ppglCoilAttributes, ppglCoilListOfAttributes] = getAttributesAndItsListForPpglCoils(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [ppglCoilAttributes, ppglCoilListOfAttributes];
    }

    case PRODUCT_TYPES.ppgl_sheets: {
      const [ppglSheetAttributes, ppglSheetListOfAttributes] = getAttributesAndItsListForPpglSheets(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [ppglSheetAttributes, ppglSheetListOfAttributes];
    }

    case PRODUCT_TYPES.wire_rod_coils: {
      const [wireRodCoilAttributes, wireRodCoilListOfAttributes] =
        getAttributesAndItsListForWireRodCoils(ccpBuyAgainApiProduct, quantity);
      return [wireRodCoilAttributes, wireRodCoilListOfAttributes];
    }

    case PRODUCT_TYPES.angles: {
      const [anglesAttributes, anglesListOfAttributes] = getAttributesAndItsListForAngles(
        ccpBuyAgainApiProduct,
        quantity,
      );
      return [anglesAttributes, anglesListOfAttributes];
    }

    case PRODUCT_TYPES.channels_beams_and_columns: {
      const [anglesAttributes, anglesListOfAttributes] =
        getAttributesAndItsListForChannelsBeamsAndColumns(ccpBuyAgainApiProduct, quantity);
      return [anglesAttributes, anglesListOfAttributes];
    }

    default:
      break;
  }
  return [attributes, listOfAttributes];
}

export function getValue(ccpBuyAgainApiProduct, key: string) {
  const [value] = ccpBuyAgainApiProduct?.ctAttributes[key]?.split(' ') || [''];
  return value;
}

export function getValueAndUom(ccpBuyAgainApiProduct, key: string) {
  const [value, uom] = ccpBuyAgainApiProduct?.ctAttributes[key]?.split(' ') || ['', ''];
  return { value, uom };
}

export function getAttributesAndItsListForTmtAndPbTmt(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: diameterValue, uom: diameterUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.diameter,
  );

  const formValue: string = ccpBuyAgainApiProduct.ctAttributes[CT_ATTRIBUTES_MAPPING.form];

  let tmtFormValue;

  if (!formValue || formValue === '') {
    tmtFormValue = 'Straight';
  } else {
    tmtFormValue = formValue;
  }

  attributes.push(
    {
      variantKey: ccpBuyAgainApiProduct.variantKey ?? '',
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.DIAMETER_MM.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.DIAMETER_MM.key,
      value: diameterValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.TMT_FORM.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.TMT_FORM.key,
      value: tmtFormValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${diameterValue} ${diameterUom} `,
      type: 'text',
    },
  );

  if (formValue && formValue !== '') {
    listOfAttributes.push({
      displayName: `${formValue}`,
      type: 'text',
    });
  }

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForAllCoils(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}${thicknessUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForAllSheets(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const lengthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.length);

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.secondaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}x${lengthValue}${thicknessUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForGiCoils(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gi,
  );
  const spangleTypeValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.spangle_type);

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.spangle_type.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.spangle_type.key,
      value: spangleTypeValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
    {
      displayName: `${spangleTypeValue}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForGiSheets(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const lengthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.length);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gi,
  );
  const spangleTypeValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.spangle_type);

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.spangle_type.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.spangle_type.key,
      value: spangleTypeValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.secondaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}x${lengthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
    {
      displayName: `${spangleTypeValue}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForGlCoils(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForGlSheets(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const lengthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.length);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.secondaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}x${lengthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForPpglCoils(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl,
  );

  const [colourType, hexValue] = getColourValue(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.colour,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.colour.displayName,
      key: colourType.replace(/_/g, ' '),
      value: hexValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
    {
      displayName: `${colourType.replace(/_/g, ' ')}`,
      type: 'colour',
      value: `${hexValue}`,
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForPpglSheets(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const widthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.width);

  const lengthValue = getValue(ccpBuyAgainApiProduct, CT_ATTRIBUTES_MAPPING.length);
  const { value: coatingGradeValue, uom: coatingGradeUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.coating_grade_gsm_gl_ppgl,
  );

  const [colourType, hexValue] = getColourValue(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.colour,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.width.key,
      value: widthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.coating_grade.key,
      value: coatingGradeValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.colour.displayName,
      key: colourType.replace(/_/g, ' '),
      value: hexValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.secondaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${thicknessValue}x${widthValue}x${lengthValue}${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${coatingGradeValue} ${coatingGradeUom}`,
      type: 'text',
    },
    {
      displayName: `${colourType.replace(/_/g, ' ')}`,
      type: 'colour',
      value: `${hexValue}`,
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForWireRodCoils(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: diameterValue, uom: diameterUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.diameter,
  );

  attributes.push({
    displayName: KEY_AND_DISPLAY_NAME_MAPPING.diameter.displayName,
    key: KEY_AND_DISPLAY_NAME_MAPPING.diameter.key,
    value: diameterValue,
  });

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${diameterValue} ${diameterUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}
export function getColourValue(ccpBuyAgainApiProduct, key: string) {
  const [colour, hexValue] = ccpBuyAgainApiProduct?.ctAttributes[key]?.split('-') || ['', ''];
  return [colour, hexValue];
}

export function getAttributesAndItsListForAngles(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: legLengthValue, uom: legLengthUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.leg,
  );

  const { value: thicknessValue, uom: thicknessUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.thickness,
  );

  const { value: lengthValue, uom: lengthUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.length,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.leg.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.leg.key,
      value: legLengthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.thickness.key,
      value: thicknessValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.leg.displayName}: ${legLengthValue} ${legLengthUom}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.thickness.displayName}: ${thicknessValue} ${thicknessUom}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.length.displayName}: ${lengthValue} ${lengthUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}

export function getAttributesAndItsListForChannelsBeamsAndColumns(ccpBuyAgainApiProduct, quantity) {
  const attributes: any[] = [];
  const listOfAttributes: any[] = [];

  const { value: flangeWidthValue, uom: flangeWidthUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.flange_width,
  );

  const { value: webDepthValue, uom: webDepthUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.web_depth,
  );

  const { value: sectionalWeightValue, uom: sectionalWeightUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.sectional_weight,
  );

  const { value: lengthValue, uom: lengthUom } = getValueAndUom(
    ccpBuyAgainApiProduct,
    CT_ATTRIBUTES_MAPPING.length,
  );

  attributes.push(
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.flange_width.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.flange_width.key,
      value: flangeWidthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.web_depth.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.web_depth.key,
      value: webDepthValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.sectional_weight.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.sectional_weight.key,
      value: sectionalWeightValue,
    },
    {
      displayName: KEY_AND_DISPLAY_NAME_MAPPING.length.displayName,
      key: KEY_AND_DISPLAY_NAME_MAPPING.length.key,
      value: lengthValue,
    },
  );

  listOfAttributes.push(
    {
      displayName: `${quantity} ${UOM_LIST[ccpBuyAgainApiProduct.primaryUom?.label] || ''}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.flange_width.displayName}: ${flangeWidthValue} ${flangeWidthUom}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.web_depth.displayName}: ${webDepthValue} ${webDepthUom}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.sectional_weight.displayName}: ${sectionalWeightValue} ${sectionalWeightUom}`,
      type: 'text',
    },
    {
      displayName: `${KEY_AND_DISPLAY_NAME_MAPPING.length.displayName}: ${lengthValue} ${lengthUom}`,
      type: 'text',
    },
  );

  return [attributes, listOfAttributes];
}
