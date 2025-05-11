/**
 * Network interface name normalizer for consistent representation
 * across different platforms like Cisco IOS, NX-OS, and Arista.
 */
class InterfaceNormalizer {
    /**
     * Initialize the normalizer with platform recognition and interface patterns
     */
    constructor() {
        // Management interface synonyms
        this.MGMT_SYNONYMS = [
            /^(?:ma)/i,
            /^(?:oob)/i,
            /^(?:oob_management)/i,
            /^(?:management)/i,
            /^(?:mgmt)/i,
        ];

        // Interface specifications with regex patterns
        this.INTERFACE_SPECS = [
            // Standard Ethernet interfaces
            {
                pattern: /^(?:eth|et|ethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "Ethernet$1",
                shortName: "Eth$1"
            },
            // Gigabit interfaces
            {
                pattern: /^(?:gi|gige|gigabiteth|gigabitethernet|gigabit)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "GigabitEthernet$1",
                shortName: "Gi$1"
            },
            // Ten-Gigabit interfaces
            {
                pattern: /^(?:te|tengig|tengige|tengigabitethernet|tengigabit)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "TenGigabitEthernet$1",
                shortName: "Te$1"
            },
            // 25-Gigabit interfaces
            {
                pattern: /^(?:twe|twentyfivegig|twentyfivegige|twentyfivegigabitethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "TwentyFiveGigE$1",
                shortName: "Twe$1"
            },
            // 40-Gigabit interfaces
            {
                pattern: /^(?:fo|fortygig|fortygige|fortygigabitethernet)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "FortyGigabitEthernet$1",
                shortName: "Fo$1"
            },
            // 100-Gigabit interfaces
            {
                pattern: /^(?:hu|hun|hundredgig|hundredgige|hundredgigabitethernet|100gig)(\d+(?:\/\d+)*(?:\.\d+)?)/i,
                longName: "HundredGigabitEthernet$1",
                shortName: "Hu$1"
            },
            // Port channels
            {
                pattern: /^(?:po|portchannel|port-channel|port_channel)(\d+)/i,
                longName: "Port-Channel$1",
                shortName: "Po$1"
            },
            // Management interfaces (with number)
            {
                pattern: /^(?:ma|mgmt|management|oob_management|oob|wan)(\d+(?:\/\d+)*)/i,
                longName: "Management$1",
                shortName: "Ma$1"
            },
            // Management interfaces (without number)
            {
                pattern: /^(?:ma|mgmt|management|oob_management|oob|wan)$/i,
                longName: "Management",
                shortName: "Ma"
            },
            // VLAN interfaces
            {
                pattern: /^(?:vl|vlan)(\d+)/i,
                longName: "Vlan$1",
                shortName: "Vl$1"
            },
            // Loopback interfaces
            {
                pattern: /^(?:lo|loopback)(\d+)/i,
                longName: "Loopback$1",
                shortName: "Lo$1"
            },
            // FastEthernet interfaces (legacy)
            {
                pattern: /^(?:fa|fast|fastethernet)(\d+(?:\/\d+)*)/i,
                longName: "FastEthernet$1",
                shortName: "Fa$1"
            }
        ];
    }

    /**
     * Normalize interface names to a consistent format
     * @param {string} interfaceName - Interface name to normalize
     * @param {string} platform - Optional platform type
     * @param {boolean} useShortName - Whether to use short interface names
     * @returns {string} Normalized interface name
     */
    normalize(interfaceName, platform = null, useShortName = true) {
        if (!interfaceName) {
            return "";
        }

        // Handle space-separated hostname
        if (interfaceName.includes(" ")) {
            const parts = interfaceName.split(" ");
            interfaceName = parts[parts.length - 1];
        }

        // Handle hyphenated hostname
        if (interfaceName.includes("-")) {
            const parts = interfaceName.split("-");
            // Only split on the last hyphen if it seems to separate a device and interface
            if (parts.length >= 2 && /^[a-zA-Z]+\d/.test(parts[parts.length - 1])) {
                interfaceName = parts[parts.length - 1];
            }
        }

        // Convert to lowercase for consistent matching
        interfaceName = interfaceName.toLowerCase().trim();

        // Check if it's a management interface variant
        for (const mgmtPattern of this.MGMT_SYNONYMS) {
            if (mgmtPattern.test(interfaceName)) {
                // Extract any numbers if present
                const numbers = interfaceName.match(/\d+(?:\/\d+)*$/);
                const suffix = numbers ? numbers[0] : "";
                return useShortName ? `Ma${suffix}` : `Management${suffix}`;
            }
        }

        // Try to match and normalize the interface name
        for (const spec of this.INTERFACE_SPECS) {
            if (spec.pattern.test(interfaceName)) {
                const replacement = useShortName ? spec.shortName : spec.longName;
                return interfaceName.replace(spec.pattern, replacement);
            }
        }

        return interfaceName;
    }

    /**
     * Determine the platform type from a platform string
     * @param {string} platformStr - Platform description string
     * @returns {string} Platform type identifier
     */
    detectPlatform(platformStr) {
        if (!platformStr) {
            return "UNKNOWN";
        }
        
        const lowerPlatform = platformStr.toLowerCase();
        
        if (lowerPlatform.includes("cisco ios")) {
            return "CISCO_IOS";
        } else if (lowerPlatform.includes("nexus") || lowerPlatform.includes("nxos")) {
            return "CISCO_NXOS";
        } else if (lowerPlatform.includes("arista")) {
            return "ARISTA";
        }
        
        return "UNKNOWN";
    }
}

module.exports = InterfaceNormalizer;