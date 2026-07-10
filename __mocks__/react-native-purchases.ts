// react-native-purchases のJestモック。
// ネイティブモジュールを呼び出さず、テストから jest.fn() の戻り値を差し替えて使う。

export enum LOG_LEVEL {
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum PACKAGE_TYPE {
  UNKNOWN = 'UNKNOWN',
  CUSTOM = 'CUSTOM',
  LIFETIME = 'LIFETIME',
  ANNUAL = 'ANNUAL',
  SIX_MONTH = 'SIX_MONTH',
  THREE_MONTH = 'THREE_MONTH',
  TWO_MONTH = 'TWO_MONTH',
  MONTHLY = 'MONTHLY',
  WEEKLY = 'WEEKLY',
}

export enum INTRO_ELIGIBILITY_STATUS {
  INTRO_ELIGIBILITY_STATUS_UNKNOWN = 0,
  INTRO_ELIGIBILITY_STATUS_INELIGIBLE = 1,
  INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2,
  INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS = 3,
}

export enum PURCHASES_ERROR_CODE {
  UNKNOWN_ERROR = '0',
  PURCHASE_CANCELLED_ERROR = '1',
  PAYMENT_PENDING_ERROR = '20',
}

const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  getCustomerInfo: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  getOfferings: jest.fn(),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(),
};

export default Purchases;
