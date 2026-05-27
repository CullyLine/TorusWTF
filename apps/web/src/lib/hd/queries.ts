/**
 * Home Depot GraphQL operations used by the /hd order-puller tool.
 *
 * These match the operations the homedepot.com website calls — we use the
 * same federation gateway endpoint and the same operation names so the
 * responses are identical to what a real customer sees.
 *
 * Field selection is kept lean on purpose:
 *   - searchModel: the bare minimum to render a result card
 *   - productClientOnlyProduct: only what we need to extract aisle/bay
 *
 * If Home Depot ever rejects a query because a field name drifted, the
 * normalizer will fall back to nulls and the UI degrades to "No Home" /
 * "—" rather than failing the whole page.
 */

export const SEARCH_MODEL_QUERY = /* GraphQL */ `
  query searchModel(
    $storeId: String
    $startIndex: Int
    $pageSize: Int
    $keyword: String
    $storefilter: StoreFilter = ALL
    $channel: Channel = DESKTOP
  ) {
    searchModel(
      keyword: $keyword
      storefilter: $storefilter
      storeId: $storeId
      channel: $channel
    ) {
      metadata {
        searchRedirect
        canonicalUrl
        clearAllRefinementsURL
        contentType
        stores {
          storeId
          storeName
        }
      }
      searchReport {
        totalProducts
        didYouMean
        correctedKeyword
        keyword
        pageSize
        startIndex
      }
      products(startIndex: $startIndex, pageSize: $pageSize) {
        itemId
        dataSources
        identifiers {
          storeSkuNumber
          productLabel
          brandName
          modelNumber
          canonicalUrl
        }
        media {
          images {
            url
            sizes
            type
            subType
          }
        }
        pricing(storeId: $storeId) {
          value
          original
          unitOfMeasure
          alternatePriceDisplay
        }
        info {
          productDepartment
          productDepartmentId
          classNumber
        }
        fulfillment(storeId: $storeId) {
          fulfillmentOptions {
            type
            fulfillable
            services {
              type
              locations {
                isAnchor
                type
                storeName
                locationId
                inventory {
                  quantity
                  isInStock
                  isOutOfStock
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Per-product detail query — only used to enrich the aisle/bay we cannot
 * get from searchModel. Asks for the smallest viable surface area.
 *
 * The "primarily-for-aisle" reasoning: searchModel does not expose store
 * layout fields, but productClientOnlyProduct's `info` block has been
 * observed to surface them on the consumer site. We also defensively
 * read every nested object in the response in `enrich.ts`, so even if
 * Home Depot moves these fields around, the recursive scan will find
 * them.
 */
export const PRODUCT_QUERY = /* GraphQL */ `
  query productClientOnlyProduct($storeId: String!, $itemId: String!) {
    product(itemId: $itemId, dataSource: "searchNova") {
      itemId
      identifiers {
        storeSkuNumber
        productLabel
        canonicalUrl
      }
      info {
        productDepartment
        productDepartmentId
        productSubType {
          name
          link
        }
        classNumber
        subClassNumber
      }
      fulfillment(storeId: $storeId) {
        fulfillmentOptions {
          type
          services {
            type
            locations {
              isAnchor
              type
              locationId
              storeName
              inventory {
                quantity
                isInStock
              }
            }
          }
        }
      }
    }
  }
`;
