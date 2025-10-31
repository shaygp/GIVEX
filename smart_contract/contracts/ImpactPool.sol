// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./SimpleImpactCertificate.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract ImpactPool {
    struct Charity {
        
        address payable walletAddress;
        string name;
        uint256 totalReceived;
        bool isActive;
        uint256 targetAmount;
        uint256 weight;
    }

    struct UserDonation {
        uint256 amount;
        uint256 timestamp;
        bool certificateIssued;
        uint256 certificateId;
    }

    IERC20 public immutable whbarToken;
    SimpleImpactCertificate public immutable certificateContract;

    mapping(address => uint256) public userDonationRates;
    mapping(address => uint256) public userBalances;
    mapping(address => uint256) public userTotalDonated;
    mapping(address => UserDonation[]) public userDonations;
    mapping(uint256 => Charity) public charities;

    uint256 public totalPoolBalance;
    uint256 public charityCount;
    uint256 private _donationCounter;

    event DonationMade(address indexed user, uint256 amount, uint256 timestamp);
    event CharityAdded(uint256 indexed charityId, string name, address walletAddress);
    event CharityFunded(uint256 indexed charityId, uint256 amount);
    event DonationRateUpdated(address indexed user, uint256 rate);
    event CertificateIssued(address indexed user, uint256 donationIndex, uint256 certificateId);

    constructor(address _whbarToken, address _certificateContract) {
        whbarToken = IERC20(_whbarToken);
        certificateContract = SimpleImpactCertificate(_certificateContract);

        // Add initial charities
        _addCharity("The Giving Block", payable(0xeDAc8fE707594C1955495fd61545D198556566a9), 75000 * 10**18, 40);
        _addCharity("Power Ledger Foundation", payable(0x393210D2F08fDE45f8AfE140CABFe6cA343343b4), 60000 * 10**18, 35);
        _addCharity("Climate Collective", payable(0x4101CD908ead410ad401Cb8af852726b757698E1), 40000 * 10**18, 25);
    }

    function _addCharity(string memory name, address payable wallet, uint256 target, uint256 weight) private {
        charities[charityCount] = Charity({
            walletAddress: wallet,
            name: name,
            totalReceived: 0,
            isActive: true,
            targetAmount: target,
            weight: weight
        });
        charityCount++;
        emit CharityAdded(charityCount - 1, name, wallet);
    }

    function donate(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(whbarToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        userBalances[msg.sender] += amount;
        totalPoolBalance += amount;
        userTotalDonated[msg.sender] += amount;

        userDonations[msg.sender].push(UserDonation({
            amount: amount,
            timestamp: block.timestamp,
            certificateIssued: false,
            certificateId: 0
        }));

        emit DonationMade(msg.sender, amount, block.timestamp);
    }

    function setDonationRate(uint256 rate) external {
        require(rate <= 10000, "Rate cannot exceed 100%");
        userDonationRates[msg.sender] = rate;
        emit DonationRateUpdated(msg.sender, rate);
    }

    function distributeToCharities() external {
        require(totalPoolBalance > 0, "No funds to distribute");

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < charityCount; i++) {
            if (charities[i].isActive) {
                totalWeight += charities[i].weight;
            }
        }

        uint256 amountToDistribute = totalPoolBalance / 10; // Distribute 10% of pool

        for (uint256 i = 0; i < charityCount; i++) {
            if (charities[i].isActive) {
                uint256 charityAmount = (amountToDistribute * charities[i].weight) / totalWeight;

                if (charityAmount > 0) {
                    charities[i].totalReceived += charityAmount;
                    totalPoolBalance -= charityAmount;

                    require(whbarToken.transfer(charities[i].walletAddress, charityAmount), "Transfer to charity failed");

                    emit CharityFunded(i, charityAmount);
                }
            }
        }
    }

    function issueCertificate(uint256 donationIndex) external {
        require(donationIndex < userDonations[msg.sender].length, "Invalid donation index");

        UserDonation storage donation = userDonations[msg.sender][donationIndex];
        require(!donation.certificateIssued, "Certificate already issued");
        require(donation.amount >= 10 * 10**18, "Minimum 10 WHBAR for certificate");

        string memory projectName = "Impact Pool Contribution";
        string memory uri = string(abi.encodePacked(
            "data:application/json;base64,",
            _base64encode(abi.encodePacked(
                '{"name":"Impact Certificate #', _toString(_donationCounter),
                '","description":"Proof of ', _toString(donation.amount / 10**18),
                ' WHBAR donation to verified impact projects","attributes":[',
                '{"trait_type":"Amount","value":"', _toString(donation.amount / 10**18), '"},',
                '{"trait_type":"Project","value":"', projectName, '"},',
                '{"trait_type":"Date","value":"', _toString(donation.timestamp), '"}]}'
            ))
        ));

        uint256 certificateId = certificateContract.mintCertificate(
            msg.sender,
            donation.amount,
            projectName,
            uri
        );

        donation.certificateIssued = true;
        donation.certificateId = certificateId;
        _donationCounter++;

        emit CertificateIssued(msg.sender, donationIndex, certificateId);
    }

    function getUserBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }

    function getTotalPoolBalance() external view returns (uint256) {
        return totalPoolBalance;
    }

    function getUserDonationRate(address user) external view returns (uint256) {
        return userDonationRates[user];
    }

    function getUserTotalDonated(address user) external view returns (uint256) {
        return userTotalDonated[user];
    }

    function getUserDonationCount(address user) external view returns (uint256) {
        return userDonations[user].length;
    }

    function getUserDonation(address user, uint256 index) external view returns (UserDonation memory) {
        require(index < userDonations[user].length, "Invalid index");
        return userDonations[user][index];
    }

    function getCharity(uint256 charityId) external view returns (Charity memory) {
        require(charityId < charityCount, "Invalid charity ID");
        return charities[charityId];
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _base64encode(bytes memory data) private pure returns (string memory) {
        return "eyJ0ZXN0IjoidmFsdWUifQ==";
    }
}