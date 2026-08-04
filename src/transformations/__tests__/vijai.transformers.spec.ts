import { transformVijaiUserListRequest } from '../vijai.transformers';
import { CustomError } from 'src/utils/CustomError';

const VALID_ID_15 = '0011000000ABCDE';
const VALID_ID_18 = '0011000000ABCDEFGH';

function buildRequest(query: string) {
  return {
    url: new URL(`http://sf.test/services/data/v59.0/query?${query}`),
  };
}

describe('vijai.transformers - transformVijaiUserListRequest SOQL injection guards', () => {
  describe('ownerId (id) validation', () => {
    it('accepts a valid 15-character Salesforce Id and interpolates it', () => {
      const request = buildRequest(`isVisitList=true&id=${VALID_ID_15}`);
      const transformed = transformVijaiUserListRequest(request);
      expect(decodeURIComponent(transformed.url.search)).toContain(`OwnerId = '${VALID_ID_15}'`);
    });

    it('accepts a valid 18-character Salesforce Id', () => {
      const request = buildRequest(`isVisitList=true&id=${VALID_ID_18}`);
      const transformed = transformVijaiUserListRequest(request);
      expect(decodeURIComponent(transformed.url.search)).toContain(`OwnerId = '${VALID_ID_18}'`);
    });

    it('rejects a SOQL injection payload in id', () => {
      const request = buildRequest(`isVisitList=true&id=${encodeURIComponent("x' OR Id != '")}`);
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });

    it('rejects an id with invalid length', () => {
      const request = buildRequest('isVisitList=true&id=0011000000');
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });
  });

  describe('developerName validation', () => {
    it.each(['Credit', 'MSME', 'PrivateBrand'])(
      'accepts allow-listed developerName "%s"',
      (developerName) => {
        const request = buildRequest(
          `isOpportunityList=true&id=${VALID_ID_15}&developerName=${developerName}`,
        );
        const transformed = transformVijaiUserListRequest(request);
        expect(decodeURIComponent(transformed.url.search)).toContain(`RecordType.DeveloperName`);
        expect(decodeURIComponent(transformed.url.search)).toContain(`'${developerName}'`);
      },
    );

    it('rejects an unknown developerName', () => {
      const request = buildRequest(
        `isOpportunityList=true&id=${VALID_ID_15}&developerName=Unknown`,
      );
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });

    it('rejects a SOQL injection payload in developerName', () => {
      const request = buildRequest(
        `isOpportunityList=true&id=${VALID_ID_15}&developerName=${encodeURIComponent(
          "Credit' OR '1'='1",
        )}`,
      );
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });
  });

  describe('accountIds validation', () => {
    it('builds a safely quoted IN clause for valid comma-separated ids', () => {
      const request = buildRequest(`isAccountById=true&accountIds=${VALID_ID_15},${VALID_ID_18}`);
      const transformed = transformVijaiUserListRequest(request);
      expect(decodeURIComponent(transformed.url.search)).toContain(`'${VALID_ID_15}'`);
      expect(decodeURIComponent(transformed.url.search)).toContain(`'${VALID_ID_18}'`);
    });

    it('tolerates pre-quoted and whitespace-padded ids', () => {
      const request = buildRequest(
        `isAccountById=true&accountIds=${encodeURIComponent(`'${VALID_ID_15}', '${VALID_ID_18}'`)}`,
      );
      const transformed = transformVijaiUserListRequest(request);
      expect(decodeURIComponent(transformed.url.search)).toContain(`'${VALID_ID_15}'`);
      expect(decodeURIComponent(transformed.url.search)).toContain(`'${VALID_ID_18}'`);
    });

    it('rejects a SOQL injection payload inside accountIds', () => {
      const request = buildRequest(
        `isAccountById=true&accountIds=${encodeURIComponent(`${VALID_ID_15}') OR (Name != '`)}`,
      );
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });

    it('rejects when no valid id is present', () => {
      const request = buildRequest('isAccountById=true&accountIds=,,');
      expect(() => transformVijaiUserListRequest(request)).toThrow(CustomError);
    });
  });

  describe('nextRecordsUrl passthrough', () => {
    it('does not require id validation when following pagination', () => {
      const request = buildRequest('nextRecordsUrl=01g5000000ABCDEF-2000');
      const transformed = transformVijaiUserListRequest(request);
      expect(transformed.url.pathname).toBe('/services/data/v59.0/query/01g5000000ABCDEF-2000');
    });
  });
});
