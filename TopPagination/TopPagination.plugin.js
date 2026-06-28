/**
 * @name TopPagination
 * @author GingerDeDwarf
 * @description Adds a second pagination control to the top of search results, with optional sticky mode and bottom pagination hiding. Also works in Mod-View users' messages lists.
 * @version 1.1.4
 * @authorId 320111316994097164
 * @website https://github.com/GingerDeDwarf/BDplugs/
 * @source https://github.com/GingerDeDwarf/BDplugs/blob/main/TopPagination/TopPagination.plugin.js
 */
const { Webpack, React, Patcher, Logger, ReactUtils, DOM, Data, UI } = new BdApi("TopPagination");
const CSS_BASE = `
[class*="searchResultsWrap"] [class*="scroller_"] { padding-top: 0; }
[class*="innerContainer"]:has([data-top-pagination]) { padding-top: 0;}
[data-top-pagination] [class*="pageControlContainer"] { margin-top: 0; }
`;
const CSS_STICKY = `
[data-top-pagination] { position: sticky; top: 0; z-index: 2; background: var(--background-base-lowest); }
[data-top-pagination] ~ * { position: relative; z-index: 1; }
`;
const CSS_HIDE_BOTTOM = `[class*="searchResultsWrap"] [class*="pageControlContainer"]:not([data-top-pagination] *) { display: none; }`;
const DEFAULT_SETTINGS = { sticky: false, hideBottom: false };
module.exports = class TopPagination {
    modules = null;
    WrapperComponent = null;
    settings = null;
    async start() {
        Logger.info("Starting plugin");
        this.settings = { ...DEFAULT_SETTINGS, ...Data.load("settings") };
        this.applyStyles();
        this.modules = await this.findModules();
        if (!this.validateModules()) return;
        this.createWrapperComponent();
        this.patchSearchResults();
        this.forceRefreshResults();
    }
    stop() {
        DOM.removeStyle();
        Patcher.unpatchAll();
        this.modules = null;
        this.WrapperComponent = null;
        this.settings = null;
        this.forceRefreshResults();
        Logger.info("Stopped plugin");
    }
    async findModules() {
        const { Filters } = Webpack;
        const SearchResultsBody = await Webpack.waitForModule(Filters.combine(Filters.bySource("paginationTotalCount"), m => m.$$typeof), { searchExports: true });
        const { PaginationWrapper } = Webpack.getMangled(Filters.bySource('Math.floor', 'pageSize', 'maxVisiblePages', 'disablePaginationGap'), { PaginationWrapper: m => typeof m === 'function' }) ?? {};
        let SearchPageSize;
        const src = SearchResultsBody?.type?.toString() || '';
        const [, pageSizeKey] = src.match(/pageSize:\s*\w+\.(\w+)/) || [];
        if (pageSizeKey) {
            const mangled = Webpack.getMangled(Filters.byKeys('GuildFeatures'), { [pageSizeKey]: m => typeof m === 'number' && m > 0 && m <= 100 });
            SearchPageSize = mangled?.[pageSizeKey];
        }
        const SearchActions = Webpack.getByKeys('fetchMessages', 'setSearchQuery');
        const SearchContextStore = Webpack.Stores.SearchAutocompleteStore;
        const SearchQueryStore = Webpack.Stores.SearchQueryStore;
        if (!SearchActions || !SearchContextStore || !SearchQueryStore) {
            Logger.warn("[TopPagination] Could not resolve search action/store modules; pagination will be disabled.");
        }
        return {
            SearchResultsBody,
            PaginationWrapper,
            SearchPageSize,
            SearchActions,
            SearchContextStore,
            SearchQueryStore
        };
    }
    validateModules() {
        const { SearchResultsBody, PaginationWrapper, SearchPageSize } = this.modules;
        if (!SearchResultsBody) {
            Logger.error("SearchResultsBody not found");
            return false;
        }
        if (!PaginationWrapper) {
            Logger.error("PaginationWrapper not found");
            return false;
        }
        if (!SearchPageSize) {
            Logger.error("SearchPageSize not found");
            return false;
        }
        return true;
    }
    createWrapperComponent() {
        const { PaginationWrapper, SearchPageSize } = this.modules;
        this.WrapperComponent = ({ children, search, paginationTotalCount, onPageChange, renderPageWrapper }) => {
            const totalCount = paginationTotalCount ?? search?.totalResults;
            const offset = search?.offset || 0;
            if (!totalCount || totalCount <= SearchPageSize) return children;
            const currentPage = Math.floor(offset / SearchPageSize) + 1;
            return React.createElement(
                React.Fragment,
                null,
                React.createElement('div', { 'data-top-pagination': true },
                    React.createElement(PaginationWrapper, {
                        currentPage,
                        totalCount,
                        pageSize: SearchPageSize,
                        maxVisiblePages: 5,
                        onPageChange: page => onPageChange(page - 1),
                        renderPageWrapper
                    })
                ),
                children
            );
        };
    }
    patchSearchResults() {
        const { SearchResultsBody } = this.modules;
        const WrapperComponent = this.WrapperComponent;
        Patcher.after(SearchResultsBody, "type", (_, [props], returnValue) => {
            const { search, renderPageWrapper, paginationTotalCount } = props;
            const onPageChange = typeof props.onPageChange === "function" ? props.onPageChange : this.buildOnPageChange(); // will onPageChange ever come back? :P
            return React.createElement(WrapperComponent, {
                search,
                paginationTotalCount,
                onPageChange,
                renderPageWrapper,
                children: returnValue
            });
        });
    }

    buildOnPageChange() {
        const { SearchActions: actions, SearchContextStore: ctxStore, SearchQueryStore: queryStore, SearchPageSize } = this.modules;
        return (zeroBasedPage) => {
            const searchContext = ctxStore.getSelectedSearchContext();
            const stateId = searchContext.guildId ?? searchContext.channelId;
            const searchQueryString = queryStore.getSearchResultsQueryString(stateId);
            actions.fetchMessages({
                searchContext,
                searchQueryString,
                offset: zeroBasedPage * SearchPageSize
            });
        };
    }
    forceRefreshResults() {
        const el = document.querySelector('[class*="searchResultsWrap"]')?.parentElement
            || document.querySelector('[class*="sidebarContainer"]')?.parentElement;
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
    applyStyles() {
        DOM.removeStyle();
        let css = CSS_BASE;
        if (this.settings.sticky) css += CSS_STICKY;
        if (this.settings.hideBottom) css += CSS_HIDE_BOTTOM;
        DOM.addStyle(css);
    }
    getSettingsPanel() {
        const saved = Data.load("settings") ?? {};
        return UI.buildSettingsPanel({
            settings: [
                {
                    type: "switch",
                    id: "sticky",
                    name: "Sticky pagination",
                    note: "Keeps the top pagination visible while scrolling through results",
                    value: saved.sticky ?? DEFAULT_SETTINGS.sticky
                },
                {
                    type: "switch",
                    id: "hideBottom",
                    name: "Hide bottom pagination",
                    note: "Hides the original pagination at the bottom of search results",
                    value: saved.hideBottom ?? DEFAULT_SETTINGS.hideBottom
                }
            ],
            onChange: (_category, id, value) => {
                this.settings[id] = value;
                Data.save("settings", this.settings);
                this.applyStyles();
            }
        });
    }
};
