import net from 'net';
import { promises as dns } from 'dns';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import assert from 'assert'
import ProgressBar from 'progress';
import clc from 'cli-color';

// IP是否合理的正则表达式
const REGEXP_IP = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
// 端口范围是否合理的正则表达式
const REGEXP_PORT_RANGE = /^(\d+)-(\d+)$/;

/**
 * 检测IP是否合法
 * @param host 
 * @returns {boolean}
 */
function isIpCheck(host: string): boolean {
  return REGEXP_IP.test(host);
}

/**
 * 检测端口范围是否合法
 * @param portRange 
 * @returns {boolean}
 */
function isPortRangeCheck(portRange: string): boolean {
  return REGEXP_PORT_RANGE.test(portRange);
}
 
async function resolveDomain(host: string) {
  try {
    const res = await dns.lookup(host);
    return res.address;
  } catch (error) {
    assert(false, '域名解析失败');
  }
}

/**
 * 扫描指定IP的端口是否开放
 * @param host
 * @param port 
 * @returns 
 */
function scanPort(host: string, port: number) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      resolve(port); // 端口开放
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(null); // 超时，端口可能关闭
    });

    socket.on('error', () => {
      resolve(null); // 连接错误，端口可能关闭
    });

    socket.connect(port, host);
  })
}

/**
 * 扫描指定IP的端口范围
 * @param host 
 * @param startPort 
 * @param endPort 
 */
async function scanPorts(host: string, startPort: number, endPort: number) {
  console.log('IP: %s', clc.green(host));
  console.log('Port Range: %s to %s', clc.green(startPort), clc.green(endPort));
  console.log('');

  // 初始化进度条
  const progressBar = new ProgressBar('进度 :percent | 时长 :elapseds [:bar]', {
    complete: '✨',
    incomplete: '-',
    width: 40,
    total: endPort - startPort,
    clear: false,
  });

  // 开始扫描
  const openPorts = [];
  for(let port = startPort; port <= endPort; port++) {
    progressBar.tick(); // 更新进度条

    const portStatus = await scanPort(host, port);
    if(portStatus !== null && portStatus) {
      process.stdout.write(clc.erase.line);
      openPorts.push(port); // 记录ip下开放的端口
    }
  }

  console.log('可用端口列表：%s', clc.green(openPorts.join(',')));
  console.log('当前主机 %s, 总共发现 %s 端口可用, 完成.', host, openPorts.length);
}

/** 
 * yargs 命令行参数配置初始化
 */
let ip: string;
let portrange: string;
yargs(
  hideBin(process.argv))
    .command('scan <ip> <portrange>', 'scan the given IP and port range', 
    (yargs) => {
      return yargs
        // 默认扫描本机
        .positional('ip', {
          describe: '扫描ip地址(支持输入域名)',
          type: 'string',
          default: '127.0.0.1'
        })
        // 默认扫描所有端口
        .positional('portrange', {
          describe: '扫描端口范围(端口范围：1-65535 或者指定某个端口：2000-2000)',
          type: 'string',
          default: '1-65535'
        })
    }, 
    (argv) => {
      // 调用main函数, 传递参数
      ip = argv.ip;
      portrange = argv.portrange;
    })
    .demandCommand(1)
    .help()  // 添加帮助信息
    .alias('h', 'help')  // 添加帮助信息
    .parse()

/**
 * 主函数
 */
async function main() {
  let host = ip;
  
  // 判断是否是域名，如果是则需要进行域名解析
  if (!isIpCheck(host)) {
    host = await resolveDomain(host);
  }

  // 断言校验
  assert(isIpCheck(host), `IP地址不合理: ${ip}`)
  assert(isPortRangeCheck(portrange), `端口范围不合理: ${portrange}`)

  let ports = portrange.split('-').map(Number); // 转换为数字数组
  await scanPorts(host, ports[0], ports[1]);
}
// 执行，执行完成后终止进程任务
main()
  .then(() => process.exit(0)) // 成功退出
  .catch((err) => { // 如果失败，输出错误并退出码为 1
    console.error(err);
    process.exit(1); // 失败退出
  })