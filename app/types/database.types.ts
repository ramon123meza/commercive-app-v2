export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      admin: {
        Row: {
          created_at: string
          email: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_customer_setting: {
        Row: {
          affiliate: string
          commission_method: number
          commission_rate: number
          customer_id: string
          uid: string
        }
        Insert: {
          affiliate: string
          commission_method: number
          commission_rate: number
          customer_id: string
          uid: string
        }
        Update: {
          affiliate?: string
          commission_method?: number
          commission_rate?: number
          customer_id?: string
          uid?: string
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          affiliate_id: string | null
          created_at: string
          form_url: string | null
          id: number
          status: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url: string | null
          user_id: string
        }
        Insert: {
          affiliate_id?: string | null
          created_at?: string
          form_url?: string | null
          id?: number
          status: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url?: string | null
          user_id: string
        }
        Update: {
          affiliate_id?: string | null
          created_at?: string
          form_url?: string | null
          id?: number
          status?: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_store_url_fkey"
            columns: ["store_url"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_url"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          back_orders: number | null
          created_at: string
          inventory_id: string
          inventory_level: Json | null
          product_id: string | null
          product_image: string | null
          product_name: string | null
          sku: string | null
          store_url: string
          variant_id: number | null
          variant_name: string | null
        }
        Insert: {
          back_orders?: number | null
          created_at?: string
          inventory_id: string
          inventory_level?: Json | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          sku?: string | null
          store_url: string
          variant_id?: number | null
          variant_name?: string | null
        }
        Update: {
          back_orders?: number | null
          created_at?: string
          inventory_id?: string
          inventory_level?: Json | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          sku?: string | null
          store_url?: string
          variant_id?: number | null
          variant_name?: string | null
        }
        Relationships: []
      }
      issues: {
        Row: {
          confirmed: boolean
          created_at: string
          email: string | null
          id: number
          issue: string | null
          name: string | null
          phone_number: string | null
          store_url: string | null
          user_id: string | null
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          email?: string | null
          id?: number
          issue?: string | null
          name?: string | null
          phone_number?: string | null
          store_url?: string | null
          user_id?: string | null
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          email?: string | null
          id?: number
          issue?: string | null
          name?: string | null
          phone_number?: string | null
          store_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      new_leads: {
        Row: {
          businessPlatform: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          orderUnits: string | null
          phone: string | null
          source: string | null
          webUrl: string | null
        }
        Insert: {
          businessPlatform?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          orderUnits?: string | null
          phone?: string | null
          source?: string | null
          webUrl?: string | null
        }
        Update: {
          businessPlatform?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          orderUnits?: string | null
          phone?: string | null
          source?: string | null
          webUrl?: string | null
        }
        Relationships: []
      }
      order: {
        Row: {
          created_at: string
          currency: string | null
          current_total_tax: string | null
          current_total_tax_set: Json | null
          customer_email: string | null
          customer_id: number | null
          financial_status: string | null
          fulfillment_status: string | null
          fulfillments: Json | null
          id: string
          line_items: Json[] | null
          order_id: number
          order_number: number
          order_status_url: string | null
          order_tags: string | null
          processed_at: string | null
          shipping_address: Json | null
          shipping_costs: number | null
          shipping_costs_usd: string | null
          store_url: string | null
          sub_total_price: string
          sub_total_price_usd: string | null
          tax_rate: number | null
          total_discounts: string | null
          total_discounts_set: Json | null
          total_order_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          current_total_tax?: string | null
          current_total_tax_set?: Json | null
          customer_email?: string | null
          customer_id?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          fulfillments?: Json | null
          id?: string
          line_items?: Json[] | null
          order_id: number
          order_number: number
          order_status_url?: string | null
          order_tags?: string | null
          processed_at?: string | null
          shipping_address?: Json | null
          shipping_costs?: number | null
          shipping_costs_usd?: string | null
          store_url?: string | null
          sub_total_price: string
          sub_total_price_usd?: string | null
          tax_rate?: number | null
          total_discounts?: string | null
          total_discounts_set?: Json | null
          total_order_value: string
          updated_at: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          current_total_tax?: string | null
          current_total_tax_set?: Json | null
          customer_email?: string | null
          customer_id?: number | null
          financial_status?: string | null
          fulfillment_status?: string | null
          fulfillments?: Json | null
          id?: string
          line_items?: Json[] | null
          order_id?: number
          order_number?: number
          order_status_url?: string | null
          order_tags?: string | null
          processed_at?: string | null
          shipping_address?: Json | null
          shipping_costs?: number | null
          shipping_costs_usd?: string | null
          store_url?: string | null
          sub_total_price?: string
          sub_total_price_usd?: string | null
          tax_rate?: number | null
          total_discounts?: string | null
          total_discounts_set?: Json | null
          total_order_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          currency: string | null
          discount_allocations: Json | null
          grams: number | null
          id: string
          image_url: string | null
          lineItem_id: number | null
          order_id: number
          price: string | null
          product_id: number | null
          quantity: number | null
          sku: string | null
          store_url: string | null
          total_discount: string | null
          vendor_name: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          discount_allocations?: Json | null
          grams?: number | null
          id?: string
          image_url?: string | null
          lineItem_id?: number | null
          order_id: number
          price?: string | null
          product_id?: number | null
          quantity?: number | null
          sku?: string | null
          store_url?: string | null
          total_discount?: string | null
          vendor_name?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          discount_allocations?: Json | null
          grams?: number | null
          id?: string
          image_url?: string | null
          lineItem_id?: number | null
          order_id?: number
          price?: string | null
          product_id?: number | null
          quantity?: number | null
          sku?: string | null
          store_url?: string | null
          total_discount?: string | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          paypal_address: string
          status: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paypal_address: string
          status: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paypal_address?: string
          status?: Database["public"]["Enums"]["AFFILIATE_STATUS"]
          store_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_store_url_fkey"
            columns: ["store_url"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["store_url"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          affiliate_id: string
          agent_name: string | null
          created_at: string
          customer_number: string
          id: number
          invoice_total: number | null
          order_number: string
          order_time: string
          quantity_of_order: number
          store_name: string
          uuid: string
        }
        Insert: {
          affiliate_id: string
          agent_name?: string | null
          created_at?: string
          customer_number: string
          id?: number
          invoice_total?: number | null
          order_number: string
          order_time: string
          quantity_of_order: number
          store_name: string
          uuid: string
        }
        Update: {
          affiliate_id?: string
          agent_name?: string | null
          created_at?: string
          customer_number?: string
          id?: number
          invoice_total?: number | null
          order_number?: string
          order_time?: string
          quantity_of_order?: number
          store_name?: string
          uuid?: string
        }
        Relationships: []
      }
      session: {
        Row: {
          accessToken: string
          accountOwner: boolean
          collaborator: boolean | null
          email: string | null
          emailVerified: boolean | null
          expires: string | null
          firstName: string | null
          id: string
          isOnline: boolean
          lastName: string | null
          locale: string | null
          scope: string | null
          shop: string
          state: string
          userId: number | null
        }
        Insert: {
          accessToken: string
          accountOwner?: boolean
          collaborator?: boolean | null
          email?: string | null
          emailVerified?: boolean | null
          expires?: string | null
          firstName?: string | null
          id: string
          isOnline?: boolean
          lastName?: string | null
          locale?: string | null
          scope?: string | null
          shop: string
          state: string
          userId?: number | null
        }
        Update: {
          accessToken?: string
          accountOwner?: boolean
          collaborator?: boolean | null
          email?: string | null
          emailVerified?: boolean | null
          expires?: string | null
          firstName?: string | null
          id?: string
          isOnline?: boolean
          lastName?: string | null
          locale?: string | null
          scope?: string | null
          shop?: string
          state?: string
          userId?: number | null
        }
        Relationships: []
      }
      store_to_user: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
          uuid: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
          uuid: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
          uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_to_user_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_to_user_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_to_user_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          is_inventory_fetched: boolean
          is_store_listed: boolean
          store_name: string
          store_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_inventory_fetched: boolean
          is_store_listed?: boolean
          store_name: string
          store_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_inventory_fetched?: boolean
          is_store_listed?: boolean
          store_name?: string
          store_url?: string
        }
        Relationships: []
      }
      trackings: {
        Row: {
          created_at: string
          destination: Json | null
          id: string
          order_id: number
          shipment_status: string | null
          status: string
          store_location: string | null
          store_url: string | null
          tracking_company: string | null
          tracking_number: string | null
          tracking_numbers: Json | null
          tracking_url: string | null
          tracking_urls: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination?: Json | null
          id?: string
          order_id: number
          shipment_status?: string | null
          status: string
          store_location?: string | null
          store_url?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_numbers?: Json | null
          tracking_url?: string | null
          tracking_urls?: Json | null
          updated_at: string
        }
        Update: {
          created_at?: string
          destination?: Json | null
          id?: string
          order_id?: number
          shipment_status?: string | null
          status?: string
          store_location?: string | null
          store_url?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_numbers?: Json | null
          tracking_url?: string | null
          tracking_urls?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trackings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "order"
            referencedColumns: ["order_id"]
          },
        ]
      }
      user: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string | null
          referral_code: string | null
          role: string | null
          user_name: string | null
          visible_pages: string[] | null
          visible_store: string[] | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          referral_code?: string | null
          role?: string | null
          user_name?: string | null
          visible_pages?: string[] | null
          visible_store?: string[] | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          referral_code?: string | null
          role?: string | null
          user_name?: string | null
          visible_pages?: string[] | null
          visible_store?: string[] | null
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          id: number
          payload: Json
          store_url: string
          topic: string
        }
        Insert: {
          created_at?: string
          id?: number
          payload: Json
          store_url: string
          topic: string
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          store_url?: string
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      affiliate_setting_view: {
        Row: {
          affiliate_id: string | null
          commission_method: number | null
          commission_rate: number | null
          count: number | null
          customer_number: string | null
          order_count: number | null
          total_amount: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ids_view: {
        Row: {
          customer_number: string | null
        }
        Relationships: []
      }
      payout_view: {
        Row: {
          status: Database["public"]["Enums"]["AFFILIATE_STATUS"] | null
          total_amount: number | null
          total_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_summary: {
        Row: {
          affiliate_id: string | null
          count: number | null
          customer_ids: string[] | null
          order_count: number | null
          total_amount: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_view: {
        Row: {
          affiliate: string | null
          affiliate_id: string | null
          agent_name: string | null
          commission_method: number | null
          commission_rate: number | null
          created_at: string | null
          customer_id: string | null
          customer_number: string | null
          id: number | null
          invoice_total: number | null
          order_number: string | null
          order_time: string | null
          quantity_of_order: number | null
          store_name: string | null
          total_commission: number | null
          uid: string | null
          user_id: string | null
          uuid: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_role_view"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_view: {
        Row: {
          id: string | null
          role: string | null
        }
        Insert: {
          id?: string | null
          role?: string | null
        }
        Update: {
          id?: string | null
          role?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_admin_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
    }
    Enums: {
      AFFILIATE_STATUS: "Pending" | "Approved" | "Declined" | "None"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      AFFILIATE_STATUS: ["Pending", "Approved", "Declined", "None"],
    },
  },
} as const
