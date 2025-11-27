// frontend/src/components/SubmitEmployeeForm.jsx
import React, { useState, useEffect, useCallback } from "react";
import * as ethers from "ethers";
import ipfsClient from "../ipfsClient";
import EmployeeManagementABI from "../EmployeeManagement.json";
import { contractAddress } from "../config";

const StatusMap = {
  0: "CHỜ DUYỆT",
  1: "ĐÃ DUYỆT",
  2: "BỊ TỪ CHỐI",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const formatAddress = (addr) => {
  if (!addr || addr === ZERO_ADDRESS) return "N/A";
  return addr.substring(0, 10) + "..." + addr.slice(-6);
};

// Modal chi tiết hồ sơ
const EmployeeDetailModal = ({ employee, onClose }) => {
  if (!employee) return null;

  const statusColor =
    employee.status === "ĐÃ DUYỆT"
      ? "#16a34a"
      : employee.status === "BỊ TỪ CHỐI"
      ? "#dc2626"
      : "#f97316";

  return (
    <div className="modal-overlay">
      <div className="modal-card modal-card--employee">
        <button className="modal-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>

        <div className="modal-header-row">
          <div>
            <h3 className="modal-title">Chi tiết hồ sơ nhân viên</h3>
            <p className="modal-meta">Mã hồ sơ #{employee.id}</p>
          </div>
          <span
            className="status-chip status-chip--in-modal"
            style={{ color: statusColor }}
          >
            {employee.status}
          </span>
        </div>

        <div className="modal-grid modal-content">
          <div className="modal-col">
            <div className="field-row">
              <span className="field-label">Họ tên</span>
              <span className="field-value">{employee.fullName}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Tuổi</span>
              <span className="field-value">{employee.age}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Chức vụ</span>
              <span className="field-value">{employee.position}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Phòng ban</span>
              <span className="field-value">{employee.department}</span>
            </div>
          </div>

          <div className="modal-col">
            <div className="field-row">
              <span className="field-label">Người nộp</span>
              <span className="field-value mono" title={employee.submitter}>
                {formatAddress(employee.submitter)}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Người duyệt</span>
              <span
                className="field-value mono"
                title={
                  employee.reviewer !== ZERO_ADDRESS ? employee.reviewer : "N/A"
                }
              >
                {formatAddress(employee.reviewer)}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-section modal-section--divider">
          <h4 className="modal-subtitle">Hồ sơ đính kèm</h4>
          <p className="ipfs-hash">
            <span className="field-label">IPFS Hash:</span>{" "}
            <span className="mono">{employee.ipfsHash}</span>
          </p>

          <a
            className="ipfs-link-btn"
            href={`http://127.0.0.1:8080/ipfs/${employee.ipfsHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem hồ sơ trên IPFS
          </a>
        </div>
      </div>
    </div>
  );
};

const SubmitEmployeeForm = ({ signer, account, provider }) => {
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [document, setDocument] = useState(null);
  const [fileName, setFileName] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userEmployees, setUserEmployees] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // ====== STATE LỖI VALIDATE ======
  const [errors, setErrors] = useState({
    fullName: "",
    age: "",
    position: "",
    department: "",
  });

  // ====== LỖI TỔNG QUÁT CỦA FORM ======
  const [formError, setFormError] = useState("");

  // ====== BỘ LỌC TRẠNG THÁI LỊCH SỬ ======
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");

  // ====== HÀM VALIDATE CHI TIẾT TỪNG TRƯỜNG ======
  const validateFullName = (value) => {
    const v = value.trim();
    if (!v) return "Họ tên không được để trống.";
    if (v.length < 3) return "Họ tên phải có ít nhất 3 ký tự.";
    if (v.length > 50) return "Họ tên không được dài quá 50 ký tự.";
    return "";
  };

  const validateAge = (value) => {
    if (!value) return "Tuổi không được để trống.";
    const num = parseInt(value, 10);
    if (Number.isNaN(num)) return "Tuổi phải là số.";
    if (num < 18) return "Tuổi phải từ 18 trở lên.";
    if (num > 65) return "Tuổi không được lớn hơn 65.";
    return "";
  };

  const validatePosition = (value) => {
    const v = value.trim();
    if (!v) return "Chức vụ không được để trống.";
    if (v.length < 2) return "Chức vụ phải có ít nhất 2 ký tự.";
    if (v.length > 100) return "Chức vụ không được dài quá 100 ký tự.";
    return "";
  };

  const validateDepartment = (value) => {
    const v = value.trim();
    if (!v) return "Phòng ban không được để trống.";
    if (v.length < 2) return "Phòng ban phải có ít nhất 2 ký tự.";
    if (v.length > 100) return "Phòng ban không được dài quá 100 ký tự.";
    return "";
  };

  // Lấy lịch sử hồ sơ của tài khoản hiện tại
  const fetchUserEmployees = useCallback(async () => {
    if (!provider || !account) return;
    setIsLoadingHistory(true);

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

      const filtered = employeeDetails
        .filter((e) => e.submitter.toLowerCase() === account.toLowerCase())
        .map((e) => ({
          id: e.employeeId.toNumber(),
          fullName: e.fullName,
          age: e.age.toNumber(),
          position: e.position,
          department: e.department,
          ipfsHash: e.documentIpfsHash,
          status: StatusMap[e.status],
          submitter: e.submitter,
          reviewer: e.reviewer,
        }));

      setUserEmployees(filtered);
    } catch (error) {
      console.error("Lỗi khi tải lịch sử hồ sơ nhân viên:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [provider, account]);

  useEffect(() => {
    if (provider && account) {
      fetchUserEmployees();
    }
  }, [provider, account, fetchUserEmployees]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setDocument(file || null);
    setFileName(file ? file.name : "");
  };

  // ====== HANDLE CHANGE KÈM VALIDATE TỪNG TRƯỜNG ======
  const handleFullNameChange = (e) => {
    const value = e.target.value;
    setFullName(value);
    setErrors((prev) => ({
      ...prev,
      fullName: validateFullName(value),
    }));
  };

  const handleAgeChange = (e) => {
    const value = e.target.value;
    setAge(value);
    setErrors((prev) => ({
      ...prev,
      age: validateAge(value),
    }));
  };

  const handlePositionChange = (e) => {
    const value = e.target.value;
    setPosition(value);
    setErrors((prev) => ({
      ...prev,
      position: validatePosition(value),
    }));
  };

  const handleDepartmentChange = (e) => {
    const value = e.target.value;
    setDepartment(value);
    setErrors((prev) => ({
      ...prev,
      department: validateDepartment(value),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate tất cả các trường trước khi gửi
    const newErrors = {
      fullName: validateFullName(fullName),
      age: validateAge(age),
      position: validatePosition(position),
      department: validateDepartment(department),
    };

    setErrors(newErrors);

    const hasError = Object.values(newErrors).some((msg) => msg !== "");
    if (hasError) {
      setFormError(
        "Bạn chưa điền đầy đủ hoặc chính xác thông tin bắt buộc. Vui lòng kiểm tra các trường được đánh dấu đỏ."
      );
      return;
    }

    if (!signer || !document) {
      setFormError("Vui lòng chọn file hồ sơ trước khi nộp.");
      return;
    }

    setFormError("");
    setIsSubmitting(true);

    try {
      const added = await ipfsClient.add(document);
      const documentIpfsHash = added.path;

      const contract = new ethers.Contract(
        contractAddress,
        EmployeeManagementABI.abi,
        signer
      );

      const tx = await contract.submitEmployee(
        fullName.trim(),
        parseInt(age, 10),
        position.trim(),
        department.trim(),
        documentIpfsHash
      );
      await tx.wait();

      alert("Nộp hồ sơ nhân viên thành công! Đang chờ Admin duyệt.");

      setFullName("");
      setAge("");
      setPosition("");
      setDepartment("");
      setDocument(null);
      setFileName("");
      setErrors({
        fullName: "",
        age: "",
        position: "",
        department: "",
      });
      setFormError("");

      fetchUserEmployees();
    } catch (error) {
      console.error("Lỗi khi nộp hồ sơ nhân viên:", error);
      setFormError(
        "Có lỗi xảy ra khi nộp hồ sơ. Vui lòng kiểm tra lại Metamask, Hardhat Node và IPFS Desktop."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusClass = (status) => {
    if (status === "ĐÃ DUYỆT") return "status-chip status-chip--approved";
    if (status === "BỊ TỪ CHỐI") return "status-chip status-chip--rejected";
    return "status-chip status-chip--pending";
  };

  // Áp dụng bộ lọc trạng thái cho lịch sử hồ sơ
  const filteredHistory = userEmployees.filter((emp) => {
    if (historyStatusFilter === "ALL") return true;
    return emp.status === historyStatusFilter;
  });

  return (
    <>
      <EmployeeDetailModal
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />

      <div className="grid grid-2">
        {/* Form nộp hồ sơ */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Nộp hồ sơ nhân viên</h2>
              <p className="card-subtitle">
                Điền thông tin và tải file hồ sơ, hệ thống sẽ lưu trữ trên IPFS
                và Blockchain.
              </p>
            </div>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {formError && <div className="form-error-alert">{formError}</div>}

            <div className="form-group">
              <label>Họ tên nhân viên</label>
              <input
                type="text"
                className={`input ${errors.fullName ? "input--error" : ""}`}
                value={fullName}
                onChange={handleFullNameChange}
                required
                placeholder="Ví dụ: Nguyễn Văn A"
              />
              {errors.fullName && (
                <p className="field-error">{errors.fullName}</p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tuổi</label>
                <input
                  type="number"
                  min="18"
                  className={`input ${errors.age ? "input--error" : ""}`}
                  value={age}
                  onChange={handleAgeChange}
                  required
                  placeholder="VD: 28"
                />
                {errors.age && <p className="field-error">{errors.age}</p>}
              </div>
              <div className="form-group">
                <label>Chức vụ</label>
                <input
                  type="text"
                  className={`input ${
                    errors.position ? "input--error" : ""
                  }`}
                  value={position}
                  onChange={handlePositionChange}
                  required
                  placeholder="VD: Chuyên viên Marketing"
                />
                {errors.position && (
                  <p className="field-error">{errors.position}</p>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Phòng ban</label>
              <input
                type="text"
                className={`input ${
                  errors.department ? "input--error" : ""
                }`}
                value={department}
                onChange={handleDepartmentChange}
                required
                placeholder="VD: Phòng Kinh doanh"
              />
              {errors.department && (
                <p className="field-error">{errors.department}</p>
              )}
            </div>

            <div className="form-group">
              <label>Hồ sơ đính kèm (CV / PDF / Ảnh)</label>
              <div className="file-input-wrapper">
                <input
                  id="document-upload"
                  type="file"
                  onChange={handleFileChange}
                  required
                  className="file-input-hidden"
                />
                <label htmlFor="document-upload" className="file-input-btn">
                  Chọn tệp
                </label>
                <span className="file-name">
                  {fileName || "Chưa có tệp nào được chọn"}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="primary-btn w-100"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Đang nộp hồ sơ..." : "Nộp hồ sơ lên Blockchain"}
            </button>
          </form>
        </div>

        {/* Lịch sử hồ sơ đã nộp */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Lịch sử hồ sơ đã nộp</h2>
            </div>
            <div className="table-toolbar">
              <select
                className="input status-filter"
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="CHỜ DUYỆT">Chờ duyệt</option>
                <option value="ĐÃ DUYỆT">Đã duyệt</option>
                <option value="BỊ TỪ CHỐI">Bị từ chối</option>
              </select>
            </div>
          </div>

          {isLoadingHistory ? (
            <p className="loading-text">Đang tải lịch sử hồ sơ...</p>
          ) : userEmployees.length === 0 ? (
            <p className="empty-text">
              Chưa có hồ sơ nào được nộp từ tài khoản này.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="empty-text">
              Không có hồ sơ nào với trạng thái đang lọc.
            </p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Họ tên</th>
                    <th>Trạng thái</th>
                    <th>Người duyệt</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((emp) => (
                    <tr key={emp.id}>
                      <td>{emp.id}</td>
                      <td>{emp.fullName}</td>
                      <td>
                        <span className={statusClass(emp.status)}>
                          {emp.status}
                        </span>
                      </td>
                      <td>
                        {emp.reviewer !== ZERO_ADDRESS
                          ? emp.reviewer.substring(0, 8) + "..."
                          : "N/A"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setSelectedEmployee(emp)}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SubmitEmployeeForm;
