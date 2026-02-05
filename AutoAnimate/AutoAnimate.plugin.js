/**
 * @name AutoAnimate
 * @version 1.0.1
 * @author GingerDeDwarf
 * @authorId 320111316994097164
 * @description Forces hover-only animations to play automatically when an animated asset is already available (avatars, server icons, banners, emojis, nameplates, role gradients etc.), with configurable settings. May increase GPU usage. Note: Does not unlock Nitro assets.
 * @website https://github.com/GingerDeDwarf/BDplugs/
 * @source https://github.com/GingerDeDwarf/BDplugs/blob/main/AutoAnimate/AutoAnimate.plugin.js
 */
const { Patcher, Data, Webpack, UI, Logger, React, Utils, ReactUtils, Hooks } = new BdApi("AutoAnimate");
const DEFAULT_SETTINGS = {
    icons: true,
    statusEmojis: false,
    nameplates: false,
    roleGradients: false
};
module.exports = class AutoAnimate {
    _iconModule = null;
    _nameplateModule = null;
    _gradientModule = null;
    constructor() {
        this.store = new Utils.Store();
        this.settings = { ...DEFAULT_SETTINGS, ...Data.load("settings") };
    }
    start() {
        Logger.info("Starting plugin");
        this.patchIconURLs();
        this.patchEmojis();
        this.patchNameplates();
        this.patchRoleGradients();
        this.refresh();
    }
    stop() {
        Patcher.unpatchAll();
        this.refresh();
        Logger.info("Stopped plugin");
    }
    SettingsPanel = () => {
        const settings = Hooks.useData("settings") ?? this.settings;
        const updateSetting = (id, value) => {
            const newSettings = { ...settings, [id]: value };
            this.settings = newSettings;
            Data.save("settings", newSettings);
            this.store.emitChange();
            this.refresh();
        };
        return UI.buildSettingsPanel({
            settings: [
                {
                    type: "switch",
                    id: "icons",
                    name: "Always animate icons",
                    note: "Forces hover animation to play for server icons, avatars, banners, and decorations when the asset is already animated/available.",
                    value: settings.icons
                },
                {
                    type: "switch",
                    id: "statusEmojis",
                    name: "Animate already-animated status emojis",
                    note: "Plays hover animation for status emojis only when the emoji asset is already animated/available. Does not enable locked emoji usage.",
                    value: settings.statusEmojis
                },
                {
                    type: "switch",
                    id: "nameplates",
                    name: "Always animate nameplates",
                    note: "Plays hover animation for animated user nameplates and badges when the asset is already animated/available.",
                    value: settings.nameplates
                },
                {
                    type: "switch",
                    id: "roleGradients",
                    name: "Always animate role gradients",
                    note: "Enables animation for role gradients only where gradient animation is already supported/available.",
                    value: settings.roleGradients
                }
            ],
            onChange: (_, id, value) => updateSetting(id, value)
        });
    };
    getSettingsPanel() {
        return React.createElement(this.SettingsPanel);
    }
    refresh() {
        const el = document.querySelector('[class*="wrapper"][class*="guilds"]');
        const inst = el && ReactUtils.getOwnerInstance(el);
        if (!inst) return;
        let revert;
        const key = Math.random();
        revert = Patcher.instead(inst, "render", (_this, args, original) => {
            const out = original.apply(_this, args);
            revert();
            return React.createElement(React.Fragment, { key }, out);
        });
        inst.forceUpdate();
    }    
    get iconModule() {
        this._iconModule ??= Webpack.getByKeys("getGuildIconURL");
        return this._iconModule;
    }
    get nameplateModule() {
        this._nameplateModule ??= Webpack.getMangled(Webpack.Filters.bySource("nameplate:", "animatedAsset"), { Nameplate: fn => typeof fn === "function" && fn.toString().includes("animate") && fn.toString().includes("loop") });
        return this._nameplateModule;
    }
    get gradientModule() {
        this._gradientModule ??= Webpack.getMangled(Webpack.Filters.bySource("Extended_Pictographic"), { useGradientStyle: fn => typeof fn === "function" && fn.toString().includes("animateGradient") && fn.toString().includes("useMemo") });
        return this._gradientModule;
    }
    patchIconURLs() {
        const iconModule = this.iconModule;
        if (!iconModule) {
            Logger.warn("Icon module not found");
            return;
        }
        const objectParamFuncs = [
            "getGuildMemberAvatarURL",
            "getGuildMemberAvatarURLSimple",
            "getGuildMemberBannerURL",
            "getUserBannerURL",
            "getAvatarDecorationURL",
            "getGuildIconURL",
            "getResourceChannelIconURL",
            "getNewMemberActionIconURL",
            "getGuildTemplateIconURL",
            "getChannelIconURL",
            "getApplicationIconURL",
            "getVideoFilterAssetURL"
        ];
        objectParamFuncs.forEach(funcName => {
            if (iconModule[funcName]) {
                Patcher.before(iconModule, funcName, (_, args) => {
                    if (!this.settings.icons) return;
                    if (args[0] && typeof args[0] === "object") {
                        args[0] = { ...args[0], canAnimate: true };
                    }
                });
            }
        });
        const booleanArgFuncs = [
            "getUserAvatarURL",
            "getUserAvatarSource",
            "getGuildBannerURL",
            "getGuildBannerSource"
        ];
        booleanArgFuncs.forEach(funcName => {
            if (iconModule[funcName]) {
                Patcher.before(iconModule, funcName, (_, args) => {
                    if (!this.settings.icons) return;
                    args[1] = true;
                });
            }
        });
    }
    patchEmojis() {
        const iconModule = this.iconModule;
        if (!iconModule?.getEmojiURL) {
            Logger.warn("Emoji URL function not found");
            return;
        }
        Patcher.before(iconModule, "getEmojiURL", (_, args) => {
            if (!this.settings.statusEmojis) return;
            if (args[0] && typeof args[0] === "object") {
                args[0] = { ...args[0], animated: true };
            }
        });
    }
    modifyAnimationProps(element) {
        if (!React.isValidElement(element)) return element;
        let modified = false;
        const newProps = {};
        if ("animate" in element.props && element.props.animate !== true) {
            newProps.animate = true;
            modified = true;
        }
        if ("loop" in element.props && element.props.loop !== true) {
            newProps.loop = true;
            modified = true;
        }
        if (element.props.children) {
            let childModified = false;
            const newChildren = React.Children.map(element.props.children, child => {
                const result = this.modifyAnimationProps(child);
                if (result !== child) childModified = true;
                return result;
            });
            if (childModified) {
                newProps.children = newChildren;
                modified = true;
            }
        }
        return modified ? React.cloneElement(element, newProps) : element;
    }
    NameplateWrapper = ({ args, originalFn }) => {
        const settings = Hooks.useStateFromStores([this.store], () => this.settings);
        const ret = originalFn(...args);
        if (!settings.nameplates) return ret;
        return this.modifyAnimationProps(ret);
    };
    patchNameplates() {
        const mod = this.nameplateModule;
        if (!mod?.Nameplate) {
            Logger.warn("Nameplate module/export not found");
            return;
        }
        Patcher.instead(mod, "Nameplate", (_thisObj, args, originalFn) => {
            return React.createElement(this.NameplateWrapper, { args, originalFn });
        });
    }
    patchRoleGradients() {
        const mod = this.gradientModule;
        if (!mod?.useGradientStyle) {
            Logger.warn("Gradient module/export not found");
            return;
        }
        Patcher.before(mod, "useGradientStyle", (_, args) => {
            if (!this.settings.roleGradients) return;
            if (args[0] && typeof args[0] === "object") {
                args[0] = { ...args[0], animateGradient: true };
            }
        });
    }
};
