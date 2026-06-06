<img width="1078" height="531" alt="ScreenShot_2026-05-31_230519_723" src="https://github.com/user-attachments/assets/244e25c4-c2d0-477b-a440-ddb1c244e0c6" />


<img width="1064" height="604" alt="ScreenShot_2026-05-31_222027_016" src="https://github.com/user-attachments/assets/16b33740-fbff-469c-b066-a10e713d608b" />


简单的节点订阅管理

worker部署

绑定KV空间：NODES_STORE 变量名相同

服务器端配合八合一脚本安装

安装后运行上传脚本 jdsc.sh  ，上传脚本根据vps所在地区，cpu类型，和机器的唯一身份前4位 进行命名
自动扫描vps当前有效的节点配置上传至worker

woker需要密码登录查看服务器，节点协议类型，节点链接

worker自动生成一键复制的订阅链接，包含由jdsc脚本上传的所有节点链接

注意：代码最上边“888”为token，自行修改 保护隐私

