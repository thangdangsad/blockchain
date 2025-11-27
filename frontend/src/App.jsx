// frontend/src/App.jsx
import { useState, useEffect, useCallback } from "react";
import * as ethers from "ethers";
import Web3Modal from "web3modal";

import EmployeeManagementABI from "./EmployeeManagement.json";
import { contractAddress } from "./config";

import SubmitEmployeeForm from "./components/SubmitEmployeeForm";
import "./App.css";

const StatusMap = {
  0: "CHỜ DUYỆT",
  1: "ĐÃ DUYỆT",
  2: "BỊ TỪ CHỐI",
};

const EMPLOYEES_PER_PAGE = 8;

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard"); // hoặc "submit" cho user

  // Tìm kiếm + phân trang cho danh sách hồ sơ
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Bộ lọc trạng thái hồ sơ (dùng cho tab "Danh sách hồ sơ")
  const [statusFilter, setStatusFilter] = useState("ALL");

  // ================== KẾT NỐI VÍ ==================
  const connectWallet = useCallback(
    async (reset = false) => {
      const web3Modal = new Web3Modal({
        network: "hardhat local",
        cacheProvider: true,
      });

      try {
        // Nếu bấm "Đổi ví / Kết nối lại"
        if (reset) {
          // 1. Xóa cache provider cũ của Web3Modal
          await web3Modal.clearCachedProvider();

          // 2. Gọi MetaMask hiển thị lại popup xin quyền / chọn tài khoản
          if (window.ethereum && window.ethereum.request) {
            await window.ethereum.request({
              method: "wallet_requestPermissions",
              params: [{ eth_accounts: {} }],
            });
          }
        }

        // 3. Kết nối ví như bình thường
        const connection = await web3Modal.connect();
        const newProvider = new ethers.providers.Web3Provider(connection);
        const newSigner = newProvider.getSigner();
        const newAccount = await newSigner.getAddress();

        setProvider(newProvider);
        setSigner(newSigner);
        setAccount(newAccount);

        // Kiểm tra quyền admin trong smart contract
        const contract = new ethers.Contract(
          contractAddress,
          EmployeeManagementABI.abi,
          newProvider
        );
        const adminAddress = await contract.adminAddress();

        const isAdminAddr =
          newAccount.toLowerCase() === adminAddress.toLowerCase();
        setIsAdmin(isAdminAddr);

        // Tab mặc định sau khi kết nối
        setActiveTab(isAdminAddr ? "dashboard" : "submit");
      } catch (error) {
        console.error("Lỗi kết nối ví:", error);
      }
    },
    []
  );

  // ================== LẤY DANH SÁCH HỒ SƠ ==================
  const fetchEmployees = useCallback(
    async (silent = false) => {
      if (!provider) return;
      if (!silent) setLoading(true);

      try {
        const contract = new ethers.Contract(
          contractAddress,
          EmployeeManagementABI.abi,
          provider
        );

        const ids = await contract.getAllEmployeeIds();
        const employeeDetails = await Promise.all(
          ids.map((id) => contract.employees(id))
        );

        setEmployees(
          employeeDetails.map((e) => ({
            id: e.employeeId.toNumber(),
            fullName: e.fullName,
            age: e.age.toNumber(),
            position: e.position,
            department: e.department,
            ipfsHash: e.documentIpfsHash,
            status: StatusMap[e.status],
            submitter: e.submitter,
            reviewer: e.reviewer,
          }))
        );
      } catch (error) {
        console.error("Lỗi khi tải danh sách hồ sơ nhân viên:", error);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [provider]
  );

  // ================== DUYỆT / TỪ CHỐI ==================
  const reviewEmployee = async (employeeId, isApproved) => {
    if (!signer || !isAdmin) return;

    const newStatus = isApproved ? 1 : 2;

    try {
      const contract = new ethers.Contract(
        contractAddress,
        EmployeeManagementABI.abi,
        signer
      );

      const tx = await contract.reviewEmployee(employeeId, newStatus);
      await tx.wait();

      alert(
        `Hồ sơ nhân viên ID ${employeeId} đã được ${
          isApproved ? "DUYỆT" : "TỪ CHỐI"
        }`
      );

      await fetchEmployees(true);
    } catch (error) {
      console.error("Lỗi khi duyệt hồ sơ:", error);
      alert("Lỗi giao dịch! Kiểm tra console và đảm bảo bạn là Admin.");
    }
  };

  // ================== KHỞI TẠO ==================
  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  useEffect(() => {
    if (provider) {
      fetchEmployees();
    }
  }, [provider, fetchEmployees]);

  // Reset trang về 1 khi dữ liệu hoặc từ khóa tìm kiếm hoặc bộ lọc trạng thái thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, employees.length]);

  // ================== UI HỖ TRỢ ==================
  const truncateAddress = (addr) =>
    addr ? addr.substring(0, 6) + "..." + addr.slice(-4) : "";

  const stats = (() => {
    const total = employees.length;
    const pending = employees.filter((e) => e.status === "CHỜ DUYỆT").length;
    const approved = employees.filter((e) => e.status === "ĐÃ DUYỆT").length;
    const rejected = employees.filter((e) => e.status === "BỊ TỪ CHỐI").length;

    return { total, pending, approved, rejected };
  })();

  // ================== UI CHƯA KẾT NỐI VÍ ==================
  if (!account) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">EmployeeChain HR</h1>
          <p className="auth-subtitle">
            Hệ thống quản lý hồ sơ nhân viên chạy trên Blockchain &amp; IPFS
          </p>
          <button className="primary-btn" onClick={() => connectWallet(false)}>
            Kết nối Metamask
          </button>
          <p className="auth-hint">
            Vui lòng mở Metamask, chọn đúng mạng Hardhat và chấp nhận kết nối.
          </p>
        </div>
      </div>
    );
  }

  // ================== LAYOUT CHUNG (HEADER + SIDEBAR) ==================
  const renderSidebar = () => {
    const menuItems = isAdmin
      ? [
          { id: "dashboard", label: "Tổng quan" },
          { id: "employees", label: "Danh sách hồ sơ" },
        ]
      : [
          { id: "submit", label: "Nộp hồ sơ" },
          { id: "guide", label: "Hướng dẫn sử dụng" },
        ];

    return (
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-circle">HR</div>
          <div>
            <div className="logo-title">EmployeeChain</div>
            <div className="logo-subtitle">HR Management</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={
                "nav-item" + (activeTab === item.id ? " nav-item--active" : "")
              }
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="role-badge">{isAdmin ? "ADMIN" : "EMPLOYEE"}</div>
          <div className="sidebar-network">Network: Hardhat Local</div>
        </div>
      </aside>
    );
  };

  const renderHeader = () => (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">
          {isAdmin
            ? activeTab === "dashboard"
              ? "Dashboard phê duyệt hồ sơ"
              : "Danh sách hồ sơ nhân viên"
            : activeTab === "submit"
            ? "Cổng nộp hồ sơ nhân viên"
            : "Hướng dẫn sử dụng"}
        </h1>
      </div>

      <div className="header-right">
        <div className="account-chip">
          <span className="account-label">Tài khoản</span>
          <span className="account-value">{truncateAddress(account)}</span>
        </div>
        <button className="ghost-btn" onClick={() => connectWallet(true)}>
          Đổi ví / Kết nối lại
        </button>
      </div>
    </header>
  );

  // ================== NỘI DUNG ADMIN ==================
  const renderAdminContent = () => {
    if (activeTab === "dashboard") {
      return (
        <div className="content">
          {/* Hàng 1: Card thống kê */}
          <div className="grid grid-4">
            <div className="stat-card">
              <div className="stat-label">Tổng số hồ sơ</div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-pill">Blockchain records</div>
            </div>

            <div className="stat-card stat-card--pending">
              <div className="stat-label">Chờ duyệt</div>
              <div className="stat-value">{stats.pending}</div>
              <div className="stat-pill">Cần xử lý</div>
            </div>

            <div className="stat-card stat-card--approved">
              <div className="stat-label">Đã duyệt</div>
              <div className="stat-value">{stats.approved}</div>
              <div className="stat-pill">Đã hoàn tất</div>
            </div>

            <div className="stat-card stat-card--rejected">
              <div className="stat-label">Bị từ chối</div>
              <div className="stat-value">{stats.rejected}</div>
              <div className="stat-pill">Cần trao đổi</div>
            </div>
          </div>

          {/* Hàng 2: Bảng rút gọn hồ sơ chờ duyệt */}
          <div className="card mt-24">
            <div className="card-header">
              <div>
                <h2 className="card-title">Hồ sơ đang chờ duyệt</h2>
                <p className="card-subtitle">
                  Danh sách các hồ sơ ở trạng thái{" "}
                  <strong>&quot;CHỜ DUYỆT&quot;</strong>.
                </p>
              </div>
            </div>

            {loading ? (
              <p className="loading-text">Đang tải dữ liệu...</p>
            ) : stats.pending === 0 ? (
              <p className="empty-text">
                Hiện chưa có hồ sơ nào ở trạng thái chờ duyệt.
              </p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Họ tên</th>
                      <th>Phòng ban</th>
                      <th>Chức vụ</th>
                      <th>Người nộp</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees
                      .filter((e) => e.status === "CHỜ DUYỆT")
                      .map((emp) => (
                        <tr key={emp.id}>
                          <td>{emp.id}</td>
                          <td>{emp.fullName}</td>
                          <td>{emp.department}</td>
                          <td>{emp.position}</td>
                          <td>{truncateAddress(emp.submitter)}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className="btn-approve"
                                onClick={() => reviewEmployee(emp.id, true)}
                              >
                                Duyệt
                              </button>
                              <button
                                className="btn-reject"
                                onClick={() => reviewEmployee(emp.id, false)}
                              >
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Tab "employees" – danh sách đầy đủ + tìm kiếm + phân trang + lọc trạng thái
    const keyword = searchTerm.trim().toLowerCase();

    const filteredEmployees = employees.filter((emp) => {
      // Lọc theo trạng thái
      if (statusFilter !== "ALL" && emp.status !== statusFilter) return false;

      // Lọc theo từ khóa tìm kiếm
      if (!keyword) return true;
      const combined =
        (emp.fullName || "") +
        " " +
        (emp.department || "") +
        " " +
        (emp.position || "") +
        " " +
        (emp.status || "") +
        " " +
        (emp.submitter || "");
      return combined.toLowerCase().includes(keyword);
    });

    const totalPages =
      filteredEmployees.length === 0
        ? 1
        : Math.ceil(filteredEmployees.length / EMPLOYEES_PER_PAGE);

    const currentPageSafe =
      currentPage > totalPages ? totalPages : currentPage < 1 ? 1 : currentPage;

    const startIndex = (currentPageSafe - 1) * EMPLOYEES_PER_PAGE;
    const paginatedEmployees = filteredEmployees.slice(
      startIndex,
      startIndex + EMPLOYEES_PER_PAGE
    );

    const handleChangePage = (page) => {
      if (page < 1 || page > totalPages) return;
      setCurrentPage(page);
    };

    return (
      <div className="content">
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                Danh sách hồ sơ (Tổng: {employees.length}) – Hiển thị:{" "}
                {filteredEmployees.length}
              </h2>
            </div>
            <div className="table-toolbar">
              <select
                className="input status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="CHỜ DUYỆT">Chờ duyệt</option>
                <option value="ĐÃ DUYỆT">Đã duyệt</option>
                <option value="BỊ TỪ CHỐI">Bị từ chối</option>
              </select>
              <input
                type="text"
                className="input search-input"
                placeholder="Tìm theo họ tên, phòng ban, chức vụ, trạng thái..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="loading-text">Đang tải...</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="empty-text">
              Không tìm thấy hồ sơ nào phù hợp với bộ lọc / từ khóa tìm kiếm.
            </p>
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Họ tên / Phòng ban</th>
                      <th>Tuổi / Chức vụ</th>
                      <th>Hồ sơ IPFS</th>
                      <th>Trạng thái</th>
                      <th>Người nộp</th>
                      <th>Người duyệt / Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEmployees.map((emp) => (
                      <tr key={emp.id}>
                        <td>{emp.id}</td>
                        <td>
                          <strong>{emp.fullName}</strong>
                          <br />
                          <span className="muted">
                            Phòng ban: {emp.department}
                          </span>
                        </td>
                        <td>
                          Tuổi: <strong>{emp.age}</strong>
                          <br />
                          <span className="muted">
                            Chức vụ: {emp.position}
                          </span>
                        </td>
                        <td>
                          <a
                            className="ipfs-link"
                            href={`http://127.0.0.1:8080/ipfs/${emp.ipfsHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Xem hồ sơ
                          </a>
                        </td>
                        <td>
                          <span
                            className={
                              "status-chip " +
                              (emp.status === "ĐÃ DUYỆT"
                                ? "status-chip--approved"
                                : emp.status === "BỊ TỪ CHỐI"
                                ? "status-chip--rejected"
                                : "status-chip--pending")
                            }
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td>{truncateAddress(emp.submitter)}</td>
                        <td>
                          {emp.status === "CHỜ DUYỆT" ? (
                            <div className="action-buttons">
                              <button
                                className="btn-approve"
                                onClick={() => reviewEmployee(emp.id, true)}
                              >
                                Duyệt
                              </button>
                              <button
                                className="btn-reject"
                                onClick={() => reviewEmployee(emp.id, false)}
                              >
                                Từ chối
                              </button>
                            </div>
                          ) : (
                            <span className="muted">
                              Đã xử lý bởi:{" "}
                              {emp.reviewer &&
                              emp.reviewer !==
                                "0x0000000000000000000000000000000000000000"
                                ? truncateAddress(emp.reviewer)
                                : "N/A"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => handleChangePage(currentPageSafe - 1)}
                  disabled={currentPageSafe === 1}
                >
                  « Trước
                </button>

                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
                  (page) => (
                    <button
                      key={page}
                      className={
                        "pagination-btn" +
                        (page === currentPageSafe
                          ? " pagination-btn--active"
                          : "")
                      }
                      onClick={() => handleChangePage(page)}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  className="pagination-btn"
                  onClick={() => handleChangePage(currentPageSafe + 1)}
                  disabled={currentPageSafe === totalPages}
                >
                  Sau »
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ================== NỘI DUNG USER ==================
  const renderUserContent = () => {
    if (activeTab === "guide") {
      return (
        <div className="content">
          <div className="card">
            <h2 className="card-title">Hướng dẫn nộp hồ sơ</h2>
            <p className="card-subtitle">
              Các bước cơ bản để bạn nộp hồ sơ nhân viên lên Blockchain.
            </p>
            <ol className="guide-list">
              <li>Kết nối ví Metamask với hệ thống EmployeeChain HR.</li>
              <li>
                Chuẩn bị file hồ sơ (CV, PDF, ảnh…) đầy đủ thông tin cần thiết.
              </li>
              <li>
                Vào menu <strong>&quot;Nộp hồ sơ&quot;</strong>, nhập thông tin
                nhân viên và tải file lên.
              </li>
              <li>
                Xác nhận giao dịch trên Metamask để ghi nhận lên Blockchain.
              </li>
              <li>
                Theo dõi trạng thái hồ sơ trong lịch sử nộp, chờ Admin phê
                duyệt.
              </li>
            </ol>
          </div>
        </div>
      );
    }

    // Tab "submit"
    return (
      <div className="content">
        <SubmitEmployeeForm
          signer={signer}
          account={account}
          provider={provider}
        />
      </div>
    );
  };

  return (
    <div className="app-shell">
      {renderSidebar()}
      <div className="main-area">
        {renderHeader()}
        {isAdmin ? renderAdminContent() : renderUserContent()}
      </div>
    </div>
  );
}

export default App;
