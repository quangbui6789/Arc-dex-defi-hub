// Import trực tiếp Bridge Kit & Viem qua CDN ES Modules
import { createBridgeKit } from "https://esm.sh/@circle-fin/bridge-kit";
import { createViemAdapter } from "https://esm.sh/@circle-fin/adapter-viem-v2";
import { createWalletClient, custom } from "https://esm.sh/viem";

let userAddress = null;

function updateLog(msg) {
    const consoleBox = document.getElementById('statusConsole');
    if (consoleBox) consoleBox.innerText = "Log: " + msg;
    console.log(msg);
}

// 1. Hàm kết nối ví MetaMask
export async function connectWallet() {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        const btn = document.getElementById('connectBtn');
        if (btn) btn.innerText = userAddress.substring(0, 6) + "..." + userAddress.substring(38);
        updateLog("Đã kết nối ví: " + userAddress);
    } catch (err) {
        updateLog("Lỗi kết nối ví: " + err.message);
    }
}

// 2. Hàm gọi Arc Bridge Kit
export async function executeArcBridge() {
    if (!userAddress) return alert("Vui lòng kết nối ví trước!");

    const fromChain = document.getElementById('fromChain')?.value || "Ethereum_Sepolia";
    const toChain = document.getElementById('toChain')?.value || "Arc_Testnet";
    const amount = document.getElementById('bridgeAmount')?.value;

    if (!amount || parseFloat(amount) <= 0) return alert("Vui lòng nhập số lượng hợp lệ!");

    try {
        updateLog(`Khởi tạo Arc Bridge từ ${fromChain} sang ${toChain}...`);

        const kit = createBridgeKit();
        const viemAdapter = createViemAdapter({
            walletClient: createWalletClient({
                transport: custom(window.ethereum),
            }),
        });

        updateLog("Đang gửi giao dịch Bridge...");

        const result = await kit.bridge({
            from: { adapter: viemAdapter, chain: fromChain },
            to: { adapter: viemAdapter, chain: toChain },
            amount: amount,
        });

        updateLog("Bridge thành công! Chi tiết: " + JSON.stringify(result));
    } catch (error) {
        updateLog("Lỗi Bridge: " + (error.reason || error.message));
    }
}
