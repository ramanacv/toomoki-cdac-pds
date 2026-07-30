# **Test Case Document: Blockchain-Enabled PDS Beneficiary Registry & Fraud Detection**

**Target Application:** \[https://demo.vikshitpds.in\](https://demo.vikshitpds.in) **Requirement Document:** Blockchain-Enabled Beneficiary Registry Management and Fraud Detection for Public Distribution System (PDS)

## **1\. Overview & Test Scope**

This document defines the functional and non-functional test cases required to validate the PDS system against the core requirements specified in the reference document. Testing focuses on verifying beneficiary lifecycle management, fraud detection mechanisms, Aadhaar/e-KYC integration, and the immutability of the blockchain audit trail.

### **Key Test Modules**

> 1. **Beneficiary Registry & Lifecycle Management**  
> 2. **Fraud & Ghost Beneficiary Detection**  
> 3. **Aadhaar, e-KYC & ePoS Integration**  
> 4. **Blockchain Immutability & Audit Trail**  
> 5. **Multi-Agency Data Synchronization**

## **2\. Test Cases Specification**

### **Module 1: Beneficiary Registry & Lifecycle Management**

| Test Case ID | Scenario / Description | Pre-conditions | Test Steps | Expected Result |
| :---- | :---- | :---- | :---- | :---- |
| **TC\_BR\_001** | Create new valid beneficiary record | User has admin/authorized officer access. | 1\. Navigate to *Add Beneficiary* page. 2\. Enter valid demographic data (Name, DOB, Address, Family Members). 3\. Submit the form. | Beneficiary is created with a unique ID, and the transaction hash is generated on the blockchain. |
| **TC\_BR\_002** | Update existing beneficiary demographic details | Beneficiary record exists on system. | 1\. Search for existing beneficiary. 2\. Modify address/economic status. 3\. Save updates. | Record is updated, prior data remains in historical state, and modification is recorded on the blockchain ledger. |
| **TC\_BR\_003** | Manage beneficiary lifecycle (Family Bifurcation) | Valid family record exists. | 1\. Select existing family card. 2\. Select members to split into a new unit. 3\. Confirm split. | Original card updates member count; new family card/ID is generated with linked lineage logged on the blockchain. |
| **TC\_BR\_004** | Mark beneficiary as Deceased / Ineligible | Beneficiary record active. | 1\. Access beneficiary profile. 2\. Mark status as "Deceased" or "Ineligible". 3\. Upload death certificate / verification doc. 4\. Submit. | Status changes to inactive/deactivated; distribution eligibility is immediately revoked. |

### **Module 2: Fraud & Ghost Beneficiary Detection**

| Test Case ID | Scenario / Description | Pre-conditions | Test Steps | Expected Result |
| :---- | :---- | :---- | :---- | :---- |
| **TC\_FD\_001** | Duplicate Beneficiary Prevention (Aadhaar / Demographic match) | A record with Aadhaar X already exists. | 1\. Attempt to create a new beneficiary with Aadhaar X. 2\. Submit registration. | System flags duplicate record error, rejects creation, and logs the attempt. |
| **TC\_FD\_002** | Flagging Ghost / Deceased Beneficiaries | Death report synced from civil registration database. | 1\. Run automated fraud detection check or manual verification scan. | System flags ghost/deceased beneficiaries and flags them for removal/verification. |
| **TC\_FD\_003** | Cross-district duplicate record flag | Same demographic/biometric data exists across two districts. | 1\. Input beneficiary details matching an existing record in a different district/region. | System alerts administrator of multi-district record duplication. |

### **Module 3: Aadhaar, e-KYC & ePoS Integration**

| Test Case ID | Scenario / Description | Pre-conditions | Test Steps | Expected Result |
| :---- | :---- | :---- | :---- | :---- |
| **TC\_INT\_001** | Perform e-KYC Authentication during registration | Aadhaar integration sandbox active. | 1\. Enter Aadhaar number. 2\. Trigger e-KYC verification (OTP / Biometric). | Verification succeeds, matching name and demographic data automatically. |
| **TC\_INT\_002** | Validate ePoS Food Grain Distribution against Registry | Active beneficiary record and valid ePoS terminal session. | 1\. Initiate grain allocation via ePoS simulation. 2\. Authenticate beneficiary via ePoS. | System confirms eligibility, completes distribution, and logs transaction. |
| **TC\_INT\_003** | Attempt distribution to deactivated/ineligible beneficiary via ePoS | Beneficiary status is "Deactivated" or "Ghost". | 1\. Initiate distribution request at ePoS terminal. | Transaction is blocked by system with an "Ineligible Beneficiary" notice. |

### **Module 4: Blockchain Immutability & Audit Trail**

| Test Case ID | Scenario / Description | Pre-conditions | Test Steps | Expected Result |
| :---- | :---- | :---- | :---- | :---- |
| **TC\_BC\_001** | Audit Trail Verification for Record Creation & Updates | Multiple lifecycle actions performed on a record. | 1\. Navigate to *Audit Trail / Blockchain Log* section. 2\. Search by Beneficiary ID. | Complete time-stamped history of creation, edits, and status changes is displayed with cryptographic transaction IDs. |
| **TC\_BC\_002** | Data Tamper Resistance Check | Record exists in database and blockchain. | 1\. Simulate unauthorized backend database entry change (if testing environment permits). 2\. Run integrity check against blockchain ledger. | System detects discrepancy between centralized store and blockchain, raising a security alert. |

### **Module 5: Multi-Agency Synchronization & Performance**

| Test Case ID | Scenario / Description | Pre-conditions | Test Steps | Expected Result |
| :---- | :---- | :---- | :---- | :---- |
| **TC\_SYNC\_001** | Multi-Agency Data Synchronization | External agency portal integrated. | 1\. Update status via municipal/external node. 2\. Check central PDS registry. | Data synchronizes in real time or near real time without data loss or mismatch. |
| **TC\_PERF\_001** | Low Connectivity / Remote Region Offline Sync | Simulated offline ePoS device. | 1\. Perform transaction offline. 2\. Re-establish network connection. | Transaction syncs to blockchain upon reconnect without duplicate entries. |

