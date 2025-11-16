export const inventoryQuery = `#graphql
      query ($cursor: String) {
  inventoryItems(first: 50, after: $cursor) {
    edges {
      node {
        id
        sku
        tracked
        variant {
          id
          title
          image {
            url
            altText
          }
          product {
            id
            title
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
          }
        }
        inventoryLevels(first: 10) {
          edges {
            node {
              id
              location {
                id
                name
              }
              quantities(names: ["available", "committed", "incoming", "on_hand", "reserved"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

export const storeInfoQuery = `#graphql
    query {
      shop {
        name
        email
        billingAddress {
          address1
          city
          company
          country
          formattedArea
          id
          latitude
          longitude
          phone
          zip
        }
        myshopifyDomain
        primaryDomain {
          url
          host
        }
      }
    }
  `;

export const fulfillmentsQuery = `#graphql
  query ($cursor: String) {
    orders(first: 50, after: $cursor, sortKey: ID, query: "fulfillment_status:fulfilled") {
      edges {
        node {
          id
          name
          fulfillments {
            id
            status
            trackingInfo {
              number
              url
              company
            }
            createdAt
            updatedAt
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
