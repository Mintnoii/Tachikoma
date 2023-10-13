import { defineStore } from "pinia";
const defaultUserInfo: IUserInfo = {
  id: "",
  token: "",
  username: "",
};

export const useUserStore = defineStore(
  "userStore",
  () => {
    const userInfo = ref<IUserInfo>(defaultUserInfo);
    const setUserInfo = (payload: IUserInfo) => {
      userInfo.value = { ...payload };
    };
    return { userInfo, setUserInfo, persist: true };
  },
  {
    persist: {
      key: "XMOV_VC_KIT_USERINFO",
    },
  },
);
