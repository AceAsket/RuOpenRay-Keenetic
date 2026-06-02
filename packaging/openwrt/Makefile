include $(TOPDIR)/rules.mk

PKG_NAME:=ruopenray-ui
PKG_VERSION:=0.3.5
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/AceAsket/RuOpenRay-Keenetic.git
PKG_SOURCE_VERSION:=main
PKG_MIRROR_HASH:=skip

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0
GO_PKG:=github.com/AceAsket/RuOpenRay-Keenetic
GO_PKG_BUILD_PKG:=$(GO_PKG)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/ruopenray-ui
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=RuOpenRay UI for Xray
  URL:=https://github.com/AceAsket/RuOpenRay-Keenetic
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +kmod-nf-tproxy +kmod-nft-tproxy +kmod-nft-socket
endef

define Package/ruopenray-ui/description
  Standalone Russian web UI for managing Xray profiles on OpenWrt.
endef

define Package/ruopenray-ui/conffiles
/etc/config/ruopenray-ui
/etc/ruopenray-ui/config.json
endef

define Package/ruopenray-ui/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/ruopenray-ui $(1)/etc/init.d/ruopenray-ui
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/ruopenray-ui $(1)/etc/config/ruopenray-ui
	$(INSTALL_DIR) $(1)/etc/ruopenray-ui/profiles
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-ruopenray.json $(1)/usr/share/luci/menu.d/luci-app-ruopenray.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-ruopenray.json $(1)/usr/share/rpcd/acl.d/luci-app-ruopenray.json
	$(INSTALL_DIR) $(1)/usr/share/ucode/luci/template/ruopenray
	$(INSTALL_DATA) ./files/usr/share/ucode/luci/template/ruopenray/dashboard.ut $(1)/usr/share/ucode/luci/template/ruopenray/dashboard.ut
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/ruopenray
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/ruopenray/dashboard.js $(1)/www/luci-static/resources/view/ruopenray/dashboard.js
endef

define Package/ruopenray-ui/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
mkdir -p /etc/ruopenray-ui/profiles /etc/ruopenray-ui/backups
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui enable >/dev/null 2>&1 || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
exit 0
endef

define Package/ruopenray-ui/prerm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
[ "$$PKG_UPGRADE" = "1" ] && exit 0
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui stop >/dev/null 2>&1 || true
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui disable >/dev/null 2>&1 || true
exit 0
endef

$(eval $(call GoBinPackage,ruopenray-ui))
$(eval $(call BuildPackage,ruopenray-ui))
