import { exec } from "child_process";
import https from "https";
import { ERROR_CHECK_URL, FEISHU_URL } from "./config.mjs";
let buildId = "";
process.argv.forEach((val) => {
  if (val.includes("build_id")) {
    buildId = val.replace("build_id", "");
  }
});
(async function requestFeishu() {
  const lastest = await getGitLog(1);
  send(`🕗正在为您打包！请稍后\n最新版本记录: \n✅ ${lastest}\n`);
})();

function send(stdout) {
  console.log(stdout);
  const String_textMsg = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      elements: [
        {
          tag: "markdown",
          content: stdout,
        },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: {
                tag: "plain_text",
                content: "点击查看打包情况...",
              },
              url: `${ERROR_CHECK_URL}/${buildId}`,
              type: "primary",
            },
          ],
        },
      ],
    },
  };
  console.log(JSON.stringify(String_textMsg));
  request(FEISHU_URL, String_textMsg);
}

function mergeFilter(message, length) {
  const reduce_merge = message
    .split("\n")
    .filter((m) => !m.includes("-Merge branch "));
  const result = reduce_merge.slice(0, length).join("\n");
  return result;
}

function getGitLog(length) {
  return new Promise((resolve, reject) => {
    exec(
      `git log --pretty=format:"%an-%s" -${length * 3}`,
      (error, stdout, stderr) => {
        if (!error) {
          // 成功
          console.log(stdout, stderr);
          resolve(mergeFilter(stdout, length));
        } else {
          // 失败
          console.log(error);
          reject(mergeFilter(error, length));
        }
      },
    );
  });
}

function request(url, data) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const req = https.request(url, options, (res) => {
    console.log(`状态码: ${res.statusCode}`);

    res.on("data", (d) => {
      process.stdout.write(d);
    });
  });

  req.on("error", (error) => {
    console.error(error);
  });

  req.write(JSON.stringify(data));
  req.end();
}
