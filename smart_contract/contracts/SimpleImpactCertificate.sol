// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract SimpleImpactCertificate {
    struct Certificate {
        uint256 id;
        address donor;
        uint256 amount;
        uint256 timestamp;
        string projectName;
        bool exists;
    }

    uint256 private _tokenIdCounter;

    mapping(uint256 => Certificate) public certificates;
    mapping(address => uint256[]) public userCertificates;
    mapping(address => uint256) public totalDonated;
    mapping(uint256 => address) public tokenOwner;
    mapping(uint256 => string) public tokenURIs;
    mapping(address => uint256) public balanceOf;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed donor,
        uint256 amount,
        string projectName,
        uint256 timestamp
    );

    function mintCertificate(
        address donor,
        uint256 amount,
        string memory projectName,
        string memory uri
    ) public returns (uint256) {
        require(donor != address(0), "Invalid donor address");
        require(amount > 0, "Amount must be greater than 0");

        uint256 tokenId = _tokenIdCounter++;

        Certificate memory newCert = Certificate({
            id: tokenId,
            donor: donor,
            amount: amount,
            timestamp: block.timestamp,
            projectName: projectName,
            exists: true
        });

        certificates[tokenId] = newCert;
        userCertificates[donor].push(tokenId);
        totalDonated[donor] += amount;
        tokenOwner[tokenId] = donor;
        tokenURIs[tokenId] = uri;
        balanceOf[donor]++;

        emit CertificateMinted(tokenId, donor, amount, projectName, block.timestamp);

        return tokenId;
    }

    function getUserCertificates(address user) public view returns (uint256[] memory) {
        return userCertificates[user];
    }

    function getCertificate(uint256 tokenId) public view returns (Certificate memory) {
        require(certificates[tokenId].exists, "Certificate does not exist");
        return certificates[tokenId];
    }

    function getUserTotalDonated(address user) public view returns (uint256) {
        return totalDonated[user];
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(certificates[tokenId].exists, "Token does not exist");
        return tokenURIs[tokenId];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        require(certificates[tokenId].exists, "Token does not exist");
        return tokenOwner[tokenId];
    }
}