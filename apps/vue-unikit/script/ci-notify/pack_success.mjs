import { exec } from 'child_process'
import https from 'https'
import { readFileSync } from 'fs'
const packageJSON = JSON.parse(readFileSync('./package.json'))
import { FEISHU_URL, VISIT_URL } from './config.mjs'
let env = ''
process.argv.forEach((val) => {
  if (val.includes('env')) {
    env = val.replace('env', '')
  }
})
;(async function requestFeishu() {
  const lastest = await getGitLog(1)
  const resent = await getGitLog(3)
  const out = resent
    .split('\n')
    .map((n) => `✅ ${n}`)
    .join('\n')
  send(
    `🎉🎉🎉打包成功！
  【环境】${env}
  【版本】${packageJSON.version}
   ${['dev', 'test'].includes(env) ? '' : '【通知】:<at id=all></at>'}
  【最新版本】: \n✅ ${lastest}
  【最近版本】: \n${out}`,
    FEISHU_URL
  )
})()
function send(stdout, feishuUrl) {
  const String_textMsg = {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      elements: [
        {
          tag: 'markdown',
          content: stdout
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '最新访问链接'
              },
              url: VISIT_URL(env),
              type: 'primary'
            }
          ]
        }
      ]
    }
  }
  request(feishuUrl, String_textMsg)
}

function mergeFilter(message, length) {
  const reduce_merge = message.split('\n').filter((m) => !m.includes('-Merge branch '))
  const result = reduce_merge.slice(0, length).join('\n')
  return result
}

function getGitLog(length) {
  return new Promise((resolve, reject) => {
    exec(`git log --pretty=format:"%an-%s" -${length * 3}`, (error, stdout, stderr) => {
      if (!error) {
        // 成功
        console.log(stdout, stderr)
        resolve(mergeFilter(stdout, length))
      } else {
        // 失败
        console.log(error)
        reject(mergeFilter(error, length))
      }
    })
  })
}

function request(url, data) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }

  const req = https.request(url, options, (res) => {
    console.log(`状态码: ${res.statusCode}`)

    res.on('data', (d) => {
      process.stdout.write(d)
    })
  })

  req.on('error', (error) => {
    console.error(error)
  })

  req.write(JSON.stringify(data))
  req.end()
}
