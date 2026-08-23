package brew

import "testing"

func TestParseInstalledAppVersion(t *testing.T) {
	tests := []struct {
		name     string
		plistXML string
		want     string
	}{
		{
			name: "short version string present",
			plistXML: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
	<key>CFBundleShortVersionString</key>
	<string>1.9.5</string>
	<key>CFBundleVersion</key>
	<string>19005</string>
</dict></plist>`,
			want: "1.9.5",
		},
		{
			name: "only CFBundleVersion present, used as fallback",
			plistXML: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
	<key>CFBundleVersion</key>
	<string>42</string>
</dict></plist>`,
			want: "42",
		},
		{
			name: "neither key present",
			plistXML: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
	<key>CFBundleName</key>
	<string>SomeApp</string>
</dict></plist>`,
			want: "",
		},
		{
			name: "short version key present but empty falls back to CFBundleVersion",
			plistXML: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
	<key>CFBundleShortVersionString</key>
	<string></string>
	<key>CFBundleVersion</key>
	<string>7</string>
</dict></plist>`,
			want: "7",
		},
		{
			name:     "empty plist",
			plistXML: "",
			want:     "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseInstalledAppVersion(tt.plistXML)
			if got != tt.want {
				t.Errorf("parseInstalledAppVersion(...) = %q, want %q", got, tt.want)
			}
		})
	}
}
