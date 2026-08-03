// ==========================================
// CONFIGURATION & CONTRACT ABIS
// ==========================================
const CHAIN_CONFIGS = {
    // Arc Testnet (Chain Nguồn)
    50: {
        name: "Arc Testnet",
        rpc: "https://rpc.testnet.arc.network", // Thay bằng RPC Arc Testnet chuẩn nếu khác
    },
    // Ethereum Sepolia (Chain Đích)
    11155111: {
        name: "Sepolia Testnet",
        rpc: "https://rpc.sepolia.org",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" // Sepolia USDC chuẩn
    },
    // Base Sepolia
    84532: {
        name: "Base Sepolia",
        rpc: "https://sepolia.base.org",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    }
};

const ERC20_MIN_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const BRIDGE_MIN_ABI = [
    "function bridgeAsset(uint256 targetChainId, address token, uint256 amount, address recipient) payable returns (bytes32)"
];

// Helper hiển thị Log ra giao diện UI
function updateLog(message) {
    console.log("[BridgeAppKit]:", message);
    const logBox = document.getElementById('logOutput') || document.getElementById('status');
    if (logBox) {
        logBox.innerText = message;
    }
}

// Helper format địa chỉ ví an toàn
function getSafeAddress(address) {
    if (!address) return "0x0000000000000000000000000000000000000000";
    return ethers.getAddress(address);
}

// ==========================================
// MAIN BRIDGE FUNCTION
// ==========================================
async function executeBridge() {
    if (!window.ethereum) return alert("Vui lòng cài đặt ví MetaMask!");

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const userAddress = await signer.getAddress();

        // Lấy giá trị từ HTML Form
        const targetChainId = document.getElementById('bridgeTargetChain')?.value || "11155111";
        const tokenSymbol = document.getElementById('bridgeToken')?.value || "USDC";
        const amountInput = document.getElementById('bridgeAmount')?.value;
        let recipientInput = document.getElementById('bridgeRecipient')?.value?.trim();

        if (!amountInput || parseFloat(amountInput) <= 0) {
            return alert("Vui lòng nhập số lượng token hợp lệ!");
        }
        if (!recipientInput) recipientInput = userAddress;

        // Địa chỉ Token & Contract Bridge
        // (Lấy từ biến toàn cục RAW_CONTRACTS trong index.html hoặc định nghĩa trực tiếp)
        const tokenAddr = getSafeAddress(window.RAW_CONTRACTS?.USDC_TOKEN || "0x0000000000000000000000000000000000000000");
        const bridgeAddr = getSafeAddress(window.RAW_CONTRACTS?.BRIDGE_CONTRACT || "0xfdB761CDB47093cEe833b8f20C6aDe50e5FbbC02");

        const tokenContract = new ethers.Contract(tokenAddr, ERC20_MIN_ABI, signer);
        const bridgeContract = new ethers.Contract(bridgeAddr, BRIDGE_MIN_ABI, signer);

        const decimals = await tokenContract.decimals();
        const parsedAmount = ethers.parseUnits(amountInput, decimals);

        // BƯỚC 1: KIỂM TRA & APPROVE TOKEN
        updateLog(`⏳ Đang kiểm tra quyền truy cập (Allowance) của ${tokenSymbol}...`);
        const allowance = await tokenContract.allowance(userAddress, bridgeAddr);

        if (allowance < parsedAmount) {
            updateLog(`🔑 Đang cấp quyền (Approve) cho Bridge Contract...`);
            const txApprove = await tokenContract.approve(bridgeAddr, ethers.MaxUint256);
            updateLog(`⏳ Chờ xác nhận Approve (Tx: ${txApprove.hash.substring(0, 10)}...)...`);
            await txApprove.wait();
            updateLog(`✅ Approve thành công!`);
        }

        // BƯỚC 2: GỬI LỆNH BRIDGE ASSET
        updateLog(`🚀 Đang khởi tạo giao dịch Bridge tới Chain ${targetChainId}...`);
        
        // Hầu hết Bridge SDK/AppKit yêu cầu truyền phí Native Token (value)
        const tx = await bridgeContract.bridgeAsset(
            BigInt(targetChainId),
            tokenAddr,
            parsedAmount,
            getSafeAddress(recipientInput),
            { 
                value: ethers.parseEther("0.0001"), // Phí relayer (nếu có)
                gasLimit: 300000n                   // Chống gãy transaction do estimate gas sai
            }
        );

        updateLog(`📤 Đã gửi Tx Bridge: ${tx.hash}. Đang chờ xác nhận trên Arc Testnet...`);
        await tx.wait();

        updateLog(`🎉 Giao dịch thành công ở Chain Nguồn! Đang chờ Relayer đúc token trên Chain Đích...`);

        // BƯỚC 3: KIỂM TRA TRẠNG THÁI TRÊN SEPOLIA
        setTimeout(() => {
            checkDestinationBalance(targetChainId, recipientInput);
        }, 5000);

    } catch (err) {
        console.error("Lỗi khi Bridge:", err);
        const errMsg = err.reason || err.message || "Giao dịch thất bại!";
        updateLog(`❌ Lỗi Bridge: ${errMsg}`);
    }
}

// ==========================================
// CHECK DESTINATION BALANCE FUNCTION
// ==========================================
async function checkDestinationBalance(targetChainId, recipientAddress) {
    const config = CHAIN_CONFIGS[targetChainId];
    if (!config || !config.rpc) {
        return updateLog("⚠️ Chain đích chưa được cấu hình RPC trong js/bridge.js");
    }

    try {
        updateLog(`🔍 Đang truy vấn trực tiếp RPC ${config.name} (${config.rpc})...`);
        const destProvider = new ethers.JsonRpcProvider(config.rpc);
        const tokenContract = new ethers.Contract(config.usdc, ERC20_MIN_ABI, destProvider);

        const balance = await tokenContract.balanceOf(recipientAddress);
        const decimals = await tokenContract.decimals();
        const formatted = ethers.formatUnits(balance, decimals);

        updateLog(`💰 Số dư trên ${config.name} của ví ${recipientAddress.substring(0,6)}... là: ${formatted} USDC`);
    } catch (err) {
        console.error("Lỗi truy vấn chain đích:", err);
        updateLog(`⚠️ Chưa thấy token xuất hiện ở Chain Đích. Cần 1-3 phút để Relayer/CCTP chuyển giao.`);
    }
}
