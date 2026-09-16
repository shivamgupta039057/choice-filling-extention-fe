export const STORAGE_KEYS = {
  auth: "choiceFillingHelperAuth",
  helper: "choiceFillingHelperState",
  priorityItems: "priorityItems"
};

const localStorageKeys = {
  ...STORAGE_KEYS,
  token: "jwt-token",
  user: "choice-helper-user"
};

export default localStorageKeys;
