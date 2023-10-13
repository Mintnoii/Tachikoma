import xmovRequest from "@/services";

// todo 定义接口请求函数的参数类型
const userLogin = (data: any) => xmovRequest("/vc/user/", { method: "POST", data });

export default {
  userLogin,
};
