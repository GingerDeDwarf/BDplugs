/**
 * @name TopPagination
 * @author GingerDeDwarf
 * @description Adds search results pagination controls to the top of the search panel & Mod View messages list.
 * @version 1.0.0
 * @authorId 320111316994097164
 * @website https://github.com/GingerDeDwarf/BDplugs/TopPagination/
 * @source https://github.com/GingerDeDwarf/BDplugs/blob/main/TopPagination/TopPagination.plugin.js
 */
const { Webpack, React, Patcher, Logger, ReactUtils } = new BdApi("TopPagination");
module.exports = class TopPagination {
    modules = null;
    WrapperComponent = null;
    start() {
        Logger.info("Starting plugin");
        this.modules = this.findModules();
        if (!this.validateModules()) return;
        this.createWrapperComponent();
        this.patchSearchResults();
        this.forceRefreshSearchResults();
    }
    stop() {
        Patcher.unpatchAll();
        this.modules = null;
        this.WrapperComponent = null;
        this.forceRefreshSearchResults();
        Logger.info("Stopped plugin");
    }
    findModules() {
        const { Filters } = Webpack;
        const { PaginationWrapper } = Webpack.getMangled(Filters.bySource('Math.floor', 'pageSize', 'maxVisiblePages'),{ PaginationWrapper: m => typeof m === 'function' }) ?? {};
        const SearchResultsBody = Webpack.getModule(Filters.combine(Filters.bySource("paginationTotalCount"), m => m.$$typeof), { searchExports: true });
        let SearchPageSize;
        const src = SearchResultsBody?.type?.toString() || '';
        const [, pageSizeKey] = src.match(/pageSize:\s*\w+\.(\w+)/) || [];
        if (pageSizeKey) {
            const mangled = Webpack.getMangled(Filters.byKeys('GuildFeatures'), { [pageSizeKey]: m => typeof m === 'number' && m > 0 && m <= 100 });
            SearchPageSize = mangled?.[pageSizeKey];
        }
        return {
            SearchResultsBody,
            PaginationWrapper,
            SearchPageSize
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
        this.WrapperComponent = ({ children, search, onPageChange, renderPageWrapper }) => {
            const totalCount = search?.totalResults;
            const offset = search?.offset || 0;
            if (!totalCount || totalCount <= SearchPageSize) return children;
            return React.createElement(
                React.Fragment,
                null,
                React.createElement(PaginationWrapper, {
                    offset,
                    totalCount,
                    pageSize: SearchPageSize,
                    onPageChange,
                    renderPageWrapper
                }),
                children
            );
        };
    }
    patchSearchResults() {
        const { SearchResultsBody } = this.modules;
        const WrapperComponent = this.WrapperComponent;
        Patcher.after(SearchResultsBody, "type", (_, [props], returnValue) => {
            const { search, onPageChange, renderPageWrapper } = props;
            return React.createElement(WrapperComponent, {
                search,
                onPageChange,
                renderPageWrapper,
                children: returnValue
            });
        });
    }
    forceRefreshSearchResults() {
        const el = document.querySelector('[class*="searchResultsWrap"]')?.parentElement;
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
};
